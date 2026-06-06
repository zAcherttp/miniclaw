import type { MessageBus } from "@/bus/queue";
import { logger } from "@/utils/logger";

interface Concatable {
	// biome-ignore lint/suspicious/noExplicitAny: concat takes and returns a merged message chunk
	concat(other: any): any;
}

function isConcatable(item: unknown): item is Concatable {
	return (
		typeof item === "object" &&
		item !== null &&
		"concat" in item &&
		typeof (item as { concat?: unknown }).concat === "function"
	);
}

interface ContentBlock {
	type: string;
	reasoning?: string;
	text?: string;
}

function getBlocks(messageChunk: unknown): ContentBlock[] | null {
	if (typeof messageChunk === "object" && messageChunk !== null) {
		if (
			"contentBlocks" in messageChunk &&
			Array.isArray((messageChunk as { contentBlocks?: unknown }).contentBlocks)
		) {
			return (messageChunk as { contentBlocks: ContentBlock[] }).contentBlocks;
		}
		if (
			"content" in messageChunk &&
			Array.isArray((messageChunk as { content?: unknown }).content)
		) {
			return (messageChunk as { content: ContentBlock[] }).content;
		}
	}
	return null;
}

function getApiReasoningDelta(messageChunk: unknown): string {
	if (typeof messageChunk !== "object" || messageChunk === null) {
		return "";
	}
	const chunk = messageChunk as Record<string, unknown>;
	if (typeof chunk.reasoning_content === "string") {
		return chunk.reasoning_content;
	}
	const addKwargs = chunk.additional_kwargs;
	if (addKwargs && typeof addKwargs === "object") {
		const kwargs = addKwargs as Record<string, unknown>;
		if (typeof kwargs.reasoning_content === "string") {
			return kwargs.reasoning_content;
		}
		if (typeof kwargs.reasoning === "string") {
			return kwargs.reasoning;
		}
	}
	return "";
}

class IncrementalThinkExtractor {
	private inThink = false;
	private buffer = "";

	extract(delta: string): { type: "reasoning" | "text"; content: string }[] {
		this.buffer += delta;
		const results: { type: "reasoning" | "text"; content: string }[] = [];

		while (this.buffer.length > 0) {
			if (!this.inThink) {
				const thinkIdx = this.buffer.indexOf("<think>");
				if (thinkIdx === -1) {
					const possiblePrefixLen = this.getPossiblePrefixLength(this.buffer, "<think>");
					const textLen = this.buffer.length - possiblePrefixLen;
					if (textLen > 0) {
						results.push({ type: "text", content: this.buffer.substring(0, textLen) });
						this.buffer = this.buffer.substring(textLen);
					}
					break;
				} else {
					if (thinkIdx > 0) {
						results.push({ type: "text", content: this.buffer.substring(0, thinkIdx) });
					}
					this.inThink = true;
					this.buffer = this.buffer.substring(thinkIdx + 7);
				}
			} else {
				const endThinkIdx = this.buffer.indexOf("</think>");
				if (endThinkIdx === -1) {
					const possiblePrefixLen = this.getPossiblePrefixLength(this.buffer, "</think>");
					const reasoningLen = this.buffer.length - possiblePrefixLen;
					if (reasoningLen > 0) {
						results.push({ type: "reasoning", content: this.buffer.substring(0, reasoningLen) });
						this.buffer = this.buffer.substring(reasoningLen);
					}
					break;
				} else {
					if (endThinkIdx > 0) {
						results.push({ type: "reasoning", content: this.buffer.substring(0, endThinkIdx) });
					}
					this.inThink = false;
					this.buffer = this.buffer.substring(endThinkIdx + 8);
				}
			}
		}

		return results;
	}

	flush(): { type: "reasoning" | "text"; content: string }[] {
		if (!this.buffer) {
			return [];
		}
		const type = this.inThink ? "reasoning" : "text";
		const content = this.buffer;
		this.buffer = "";
		return [{ type, content }];
	}

	private getPossiblePrefixLength(str: string, target: string): number {
		for (let len = Math.min(str.length, target.length - 1); len > 0; len--) {
			if (target.startsWith(str.substring(str.length - len))) {
				return len;
			}
		}
		return 0;
	}
}

/**
 * Observer that intercepts agent/model streaming chunks and tool calls,
 * translating them into clean real-time Telegram message updates published to the MessageBus.
 */
export class AgentEventObserver {
	private readonly bus: MessageBus;
	private readonly chatId: string;
	private readonly channel: string;
	private readonly replyTo?: string;
	private readonly streamId: string;
	private hasReasoned = false;
	private reasoningClosed = false;
	private readonly thinkExtractor = new IncrementalThinkExtractor();
	public cachedSystemPrompt?: string;

	constructor(
		bus: MessageBus,
		chatId: string,
		channel: string,
		replyTo?: string,
		streamId?: string,
	) {
		this.bus = bus;
		this.chatId = chatId;
		this.channel = channel;
		this.replyTo = replyTo;
		this.streamId = streamId || `agent-${Date.now()}`;
	}

	private async publishReasoningDelta(delta: string) {
		this.hasReasoned = true;
		await this.bus.publishOutbound({
			channel: this.channel,
			chat_id: this.chatId,
			content: delta,
			reply_to: this.replyTo,
			metadata: {
				_stream_id: this.streamId,
				_reasoning_delta: true,
				reply_to: this.replyTo,
			},
		});
	}

	private async publishTextDelta(delta: string) {
		if (this.hasReasoned && !this.reasoningClosed) {
			await this.bus.publishOutbound({
				channel: this.channel,
				chat_id: this.chatId,
				content: "",
				reply_to: this.replyTo,
				metadata: {
					_stream_id: this.streamId,
					_reasoning_end: true,
					reply_to: this.replyTo,
				},
			});
			this.reasoningClosed = true;
		}
		await this.bus.publishOutbound({
			channel: this.channel,
			chat_id: this.chatId,
			content: delta,
			reply_to: this.replyTo,
			metadata: {
				_stream_id: this.streamId,
				_stream_delta: true,
				reply_to: this.replyTo,
			},
		});
	}

	/**
	 * Consumes message chunks from the agent/model stream in real-time,
	 * parsing content blocks (text and reasoning blocks) and publishing them.
	 */
	async consume(stream: AsyncIterable<unknown>): Promise<unknown> {
		let accumulated: unknown = null;
		for await (const chunk of stream) {
			// In LangGraph streamMode: "messages", each item in the iterator can be [AIMessageChunk, metadata] or just AIMessageChunk
			let messageChunk = chunk;
			if (Array.isArray(chunk) && chunk.length > 0) {
				messageChunk = chunk[0];
			}

			if (!messageChunk) continue;

			if (accumulated === null) {
				accumulated = messageChunk;
			} else if (isConcatable(accumulated)) {
				accumulated = accumulated.concat(messageChunk);
			} else {
				logger.warn(
					"[Observer] Stream chunk is not concatable, overwriting previous chunk",
				);
				accumulated = messageChunk;
			}

			// 1. Check for structured blocks
			const blocks = getBlocks(messageChunk);
			if (blocks) {
				for (const block of blocks) {
					if (block.type === "reasoning") {
						const rDelta = block.reasoning || block.text || "";
						if (rDelta) {
							await this.publishReasoningDelta(rDelta);
						}
					} else if (block.type === "text") {
						const tDelta = block.text || "";
						if (tDelta) {
							await this.publishTextDelta(tDelta);
						}
					}
				}
			} else {
				// 2. Fallback / Standard format (Ollama, Gemini, OpenAI, etc.)
				
				// A. Check for API-based reasoning first
				const rDelta = getApiReasoningDelta(messageChunk);
				if (rDelta) {
					await this.publishReasoningDelta(rDelta);
				}

				// B. Check for text content
				const chunkText =
					typeof messageChunk === "object" &&
					messageChunk !== null &&
					"content" in messageChunk &&
					typeof (messageChunk as { content: unknown }).content === "string"
						? (messageChunk as { content: string }).content
						: "";

				if (chunkText) {
					// Use IncrementalThinkExtractor to separate inline `<think>` tags from content
					const segments = this.thinkExtractor.extract(chunkText);
					for (const segment of segments) {
						if (segment.type === "reasoning") {
							await this.publishReasoningDelta(segment.content);
						} else {
							await this.publishTextDelta(segment.content);
						}
					}
				}
			}
		}

		// Flush any remaining buffered content from the think extractor
		const remaining = this.thinkExtractor.flush();
		for (const segment of remaining) {
			if (segment.type === "reasoning") {
				await this.publishReasoningDelta(segment.content);
			} else {
				await this.publishTextDelta(segment.content);
			}
		}

		// Ensure active reasoning blocks are closed cleanly
		if (this.hasReasoned && !this.reasoningClosed) {
			await this.bus.publishOutbound({
				channel: this.channel,
				chat_id: this.chatId,
				content: "",
				reply_to: this.replyTo,
				metadata: {
					_stream_id: this.streamId,
					_reasoning_end: true,
					reply_to: this.replyTo,
				},
			});
			this.reasoningClosed = true;
		}

		// Finalize streaming channels
		await this.bus.publishOutbound({
			channel: this.channel,
			chat_id: this.chatId,
			content: "",
			reply_to: this.replyTo,
			metadata: {
				_stream_id: this.streamId,
				_stream_end: true,
				reply_to: this.replyTo,
			},
		});

		return accumulated;
	}

	async publishNotification(content: string) {
		await this.bus.publishOutbound({
			channel: this.channel,
			chat_id: this.chatId,
			content,
			reply_to: this.replyTo,
		});
	}

	async publishToolStart(
		// biome-ignore lint/suspicious/noExplicitAny: tool arguments can be any primitive or structured value
		toolCalls: { name: string; args: Record<string, any> }[],
	) {
		const hintText = toolCalls
			.map((tc) => `${formatToolCall(tc.name, tc.args)}\n`)
			.join("");
		await this.bus.publishOutbound({
			channel: this.channel,
			chat_id: this.chatId,
			content: hintText,
			metadata: {
				_stream_id: `tools-${this.streamId}`,
				_stream_delta: true,
				_tool_names: toolCalls.map((tc) => tc.name),
			},
		});
	}

	/**
	 * Finalizes the tool call execution stream.
	 */
	async publishToolEnd() {
		await this.bus.publishOutbound({
			channel: this.channel,
			chat_id: this.chatId,
			content: "",
			metadata: {
				_stream_id: `tools-${this.streamId}`,
				_stream_end: true,
			},
		});
	}
}

// biome-ignore lint/suspicious/noExplicitAny: arguments are dynamically inspected depending on the tool type
function formatToolCall(name: string, args: Record<string, any> = {}): string {
	const getBasename = (filePath?: string) => {
		if (!filePath) return "unknown";
		const parts = filePath.replace(/\\/g, "/").split("/");
		return parts[parts.length - 1] || "unknown";
	};

	const truncate = (str?: string, maxLen = 30) => {
		if (!str) return "";
		if (str.length <= maxLen) return str;
		return `${str.slice(0, maxLen)}...`;
	};

	switch (name) {
		case "search_skills":
			return `⚙️ Searching skills for "${args.query || ""}"...`;
		case "read_file":
			return `⚙️ Reading file: ${getBasename(args.file_path || args.path)}...`;
		case "write_file":
			return `⚙️ Writing file: ${getBasename(args.path || args.file_path)}...`;
		case "edit_file":
			return `⚙️ Editing file: ${getBasename(args.file_path || args.path)}...`;
		case "list_files":
			return `⚙️ Listing files in "${args.path || "."}"...`;
		case "grep_search":
			return `⚙️ Searching files for "${args.query || ""}"...`;
		case "execute":
			return `⚙️ Running command: ${truncate(args.command)}...`;
		case "remember":
			return `⚙️ Remembering fact: "${truncate(args.content)}"...`;
		case "recall":
			return `⚙️ Recalling memories for "${args.query || ""}"...`;
		case "manage_reminders": {
			const action = args.action || "list";
			if (action === "create") {
				return `⚙️ Creating reminder: "${args.title || ""}"...`;
			}
			if (action === "update") {
				return `⚙️ Updating reminder: ${args.id || ""}...`;
			}
			if (action === "delete") {
				return `⚙️ Deleting reminder: ${args.id || ""}...`;
			}
			return `⚙️ Listing reminders...`;
		}
		case "write_todos":
			return `⚙️ Updating todo checklist...`;
		default:
			return `⚙️ Calling ${name}...`;
	}
}
