import {
	type AIMessageChunk,
	type BaseMessage,
	HumanMessage,
	SystemMessage,
	ToolMessage,
} from "@langchain/core/messages";
import type { StructuredTool } from "@langchain/core/tools";
import type { InboundMessage } from "@/bus/message";
import type { MessageBus } from "@/bus/queue";
import { getWorkspaceDir } from "@/config/paths";
import type { AppConfig } from "@/config/schema";
import { logger } from "@/utils/logger";
import { ContextEngineeringManager, SessionHistory } from "./history";
import { createChatModel } from "./models";
import { createFilesystemTools } from "./tools/filesystem";
import { createWriteTodosTool } from "./tools/todos";

const INBOUND_BATCH_MAX_CONTENT_LENGTH = 1200;
const INBOUND_BATCH_DEBOUNCE_MS = 250;

const DEFAULT_SYSTEM_PROMPT = `You are Miniclaw, an autonomous, highly secure personal assistant.
Your goal is to solve the user's request systematically, safely, and efficiently.

## Core Behavior
- Be concise and direct. Don't over-explain unless asked.
- NEVER add unnecessary preamble ("Sure!", "Great question!", "I'll now...").
- Don't say "I'll now do X" — just do it.
- If the request is ambiguous, ask questions before acting.
- If asked how to approach something, explain first, then act.

## Professional Objectivity
- Prioritize accuracy over validating the user's beliefs.
- Disagree respectfully when the user is incorrect.
- Avoid unnecessary superlatives, praise, or emotional validation.

## Doing Tasks
1. **Understand first** — read relevant files, check existing patterns. Quick but thorough — gather enough evidence to start, then iterate.
2. **Decompose & Plan** — use the write_todos tool to create a clear, step-by-step checklist of your plan before writing code.
3. **Act** — implement the solution. Work quickly but accurately.
4. **Verify** — check your work against what was asked, not against your own output. Your first attempt is rarely correct — iterate.

Keep working until the task is fully complete. Don't stop partway and explain what you would do — just do it. Only yield back to the user when the task is done or you're genuinely blocked.

**When things go wrong:**
- If something fails repeatedly, stop and analyze *why* — don't keep retrying the same approach.
- If you're blocked, tell the user what's wrong and ask for guidance.

## Progress Updates
For longer tasks, provide brief progress updates at reasonable intervals — a concise sentence recapping what you've done and what's next.

## Plan Hygiene
- Before finishing, reconcile every TODO or plan item created via write_todos. Mark each as done, blocked (with a one-sentence reason), or cancelled. Do not finish with pending items.

## Security & Sandboxing Constraints
- **Sandbox Boundary**: You are strictly sandboxed to the active workspace directory. You cannot access, read, or write any files outside this folder.
- **No Directory Traversal**: Any attempt to use \`../\`, absolute paths, or symlinks to escape the workspace directory will trigger a security violation.
- **Safe Commands**: All file and search actions are handled through secure, sandboxed utility APIs. Do not attempt to run arbitrary terminal commands.`;

/**
 * Remove thinking blocks, unclosed trailing tags, and templates from text.
 */
export function stripThink(text: string): string {
	let t = text;
	t = t.replace(/<think>[\s\S]*?<\/think>/g, "");
	t = t.replace(/^\s*<think>[\s\S]*$/, "");
	t = t.replace(/<thought>[\s\S]*?<\/thought>/g, "");
	t = t.replace(/^\s*<thought>[\s\S]*$/, "");

	t = t.replace(/<think(?![A-Za-z0-9_\-:>/])/g, "");
	t = t.replace(/<thought(?![A-Za-z0-9_\-:>/])/g, "");

	t = t.replace(/^\s*<\/think>\s*/g, "");
	t = t.replace(/\s*<\/think>\s*$/g, "");
	t = t.replace(/^\s*<\/thought>\s*/g, "");
	t = t.replace(/\s*<\/thought>\s*$/g, "");

	t = t.replace(/^\s*<\|?channel\|?>\s*/g, "");

	const partialControlTag =
		/<\/?(?:t|th|thi|thin|think|tho|thou|thoug|though|thought)>?$|<\|?(?:c|ch|cha|chan|chann|channe|channel)(?:\|?>?)?$/;
	t = t.replace(partialControlTag, "");
	t = t.replace(/^\s*<\|?$/g, "");

	return t.trim();
}

/**
 * Extract thinking content from inline `<think>` / `<thought>` blocks.
 */
export function extractThink(text: string): [string | null, string] {
	const parts: string[] = [];
	const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
	for (const match of text.matchAll(thinkRegex)) {
		parts.push(match[1].trim());
	}
	const thoughtRegex = /<thought>([\s\S]*?)<\/thought>/g;
	for (const match of text.matchAll(thoughtRegex)) {
		parts.push(match[1].trim());
	}
	const thinking = parts.length > 0 ? parts.join("\n\n") : null;
	return [thinking, stripThink(text)];
}

/**
 * Stateful inline `<think>` extractor for streaming buffers.
 */
export class IncrementalThinkExtractor {
	public emitted = "";

	reset(): void {
		this.emitted = "";
	}

	async feed(
		buf: string,
		emit: (text: string) => Promise<void>,
	): Promise<boolean> {
		const [thinking] = extractThink(buf);
		if (!thinking || thinking === this.emitted) {
			return false;
		}
		const newThink = thinking.substring(this.emitted.length).trim();
		this.emitted = thinking;
		if (!newThink) {
			return false;
		}
		await emit(newThink);
		return true;
	}
}

/**
/**
 * Formats tool calls as a human-readable hint string without asterisks or arguments.
 */
function formatToolCallMessage(toolCalls: { name: string }[]): string {
	const names = toolCalls.map((tc) => tc.name).join(", ");
	return `⚙️ Calling ${names}`;
}

export class AgentLoop {
	public readonly config: AppConfig;
	private bus: MessageBus;
	public running: boolean = false;
	private inboundTask?: Promise<void>;
	private activeExecutions = new Map<
		string,
		{ abortController: AbortController }
	>();

	constructor(config: AppConfig, bus: MessageBus) {
		this.config = config;
		this.bus = bus;
	}

	async cancelChat(chatId: string): Promise<boolean> {
		const active = this.activeExecutions.get(chatId);
		if (active) {
			active.abortController.abort();
			this.activeExecutions.delete(chatId);
			return true;
		}
		return false;
	}

	isChatActive(chatId: string): boolean {
		return this.activeExecutions.has(chatId);
	}

	async start() {
		if (this.running) return;
		this.running = true;
		logger.info(`[AgentLoop] Started with model ${this.config.agent.model}`);

		this.inboundTask = this.processInbound();
	}

	async stop() {
		if (!this.running) return;
		this.running = false;
		await this.bus.publishInbound({
			channel: "__system__",
			sender_id: "__system__",
			chat_id: "__shutdown__",
			content: "",
			metadata: { _shutdown: true },
		});
		await this.inboundTask;
		logger.info("[AgentLoop] Stopped.");
	}

	private async processInbound() {
		while (this.running) {
			try {
				const batch = await this.bus.consumeInboundBatch({
					maxCombinedContentLength: INBOUND_BATCH_MAX_CONTENT_LENGTH,
					debounceMs: INBOUND_BATCH_DEBOUNCE_MS,
				});
				const first = batch[0];
				if (!this.running || first.metadata?._shutdown === true) {
					break;
				}
				const msg = this.coalesceInbound(batch);
				const batchTag = batch.length > 1 ? ` [batched x${batch.length}]` : "";
				logger.info(
					`[AgentLoop] Received from ${msg.channel} (${msg.chat_id}): ${msg.content}${batchTag}`,
				);

				const controller = new AbortController();
				this.activeExecutions.set(msg.chat_id, { abortController: controller });

				const workspaceDir = getWorkspaceDir(this.config.workspace_dir);
				const history = new SessionHistory(msg.chat_id);
				const pastMessages = await history.loadHistory(40);

				// Persist user message in history
				await history.appendMessage("user", msg.content);

				const memoryGuidelines =
					await ContextEngineeringManager.loadMemoryFiles(workspaceDir);
				const systemPrompt =
					(this.config.agent.system_prompt || DEFAULT_SYSTEM_PROMPT) +
					memoryGuidelines;

				const activeMessages: BaseMessage[] = [
					new SystemMessage(systemPrompt),
					...pastMessages,
					new HumanMessage(msg.content),
				];

				const fsTools = createFilesystemTools(workspaceDir);
				const todoTool = createWriteTodosTool(workspaceDir);
				const tools = [...fsTools, todoTool];
				const toolsByName = new Map<string, StructuredTool>(
					tools.map((t) => [t.name, t]),
				);

				const model = await createChatModel(this.config);
				const modelWithTools = model.bindTools(tools);

				const replyTo = msg.metadata?.message_id?.toString();
				const streamId = `agent-${Date.now()}`;

				let assistantFinalResponse = "";
				let currentIteration = 0;
				const maxIterations = this.config.agent.max_iterations ?? 15;

				try {
					while (
						currentIteration < maxIterations &&
						this.running &&
						!controller.signal.aborted
					) {
						currentIteration++;
						logger.info(
							`[AgentLoop] Starting iteration ${currentIteration}/${maxIterations}`,
						);

						if (controller.signal.aborted) {
							break;
						}

						let stream: AsyncIterable<AIMessageChunk>;
						try {
							stream = await modelWithTools.stream(activeMessages, {
								signal: controller.signal,
							});
						} catch (e) {
							if (controller.signal.aborted) {
								break;
							}
							logger.error(e, "[AgentLoop] Failed to initialize model stream");
							// Fallback to non-streaming invoke
							try {
								const response = await modelWithTools.invoke(activeMessages, {
									signal: controller.signal,
								});
								if (controller.signal.aborted) {
									break;
								}
								activeMessages.push(response);
								assistantFinalResponse =
									typeof response.content === "string"
										? stripThink(response.content)
										: "";

								const toolCalls = response.tool_calls || [];
								if (toolCalls.length > 0) {
									const hintText = formatToolCallMessage(toolCalls);
									await this.bus.publishOutbound({
										channel: msg.channel,
										chat_id: msg.chat_id,
										content: hintText,
										metadata: {
											_stream_id: `tools-${streamId}`,
											_stream_delta: true,
											_overwrite: true,
										},
									});

									for (const tc of toolCalls) {
										if (controller.signal.aborted) {
											break;
										}
										const tool = toolsByName.get(tc.name);
										let result: string;
										const argsStr = JSON.stringify(tc.args);
										const truncatedArgs =
											argsStr.length > 150
												? `${argsStr.substring(0, 147)}...`
												: argsStr;
										logger.info(
											`[AgentLoop] Calling tool: ${tc.name} with args: ${truncatedArgs}`,
										);
										if (!tool) {
											result = `Error: Tool ${tc.name} is not available.`;
											logger.error(
												`[AgentLoop] Tool ${tc.name} is not available.`,
											);
										} else {
											try {
												result = await tool.invoke(tc.args);
												const truncatedResult =
													result.length > 200
														? `${result.substring(0, 197)}...`
														: result;
												logger.info(
													`[AgentLoop] Tool ${tc.name} returned: ${truncatedResult}`,
												);
											} catch (err) {
												const errorMsg =
													err instanceof Error ? err.message : String(err);
												result = `Error executing tool ${tc.name}: ${errorMsg}`;
												logger.error(
													err,
													`[AgentLoop] Tool ${tc.name} failed with error: ${errorMsg}`,
												);
											}
										}
										activeMessages.push(
											new ToolMessage({
												content: result,
												tool_call_id: tc.id ?? "",
												name: tc.name,
											}),
										);
									}
									continue; // continue to next iteration
								}
								break; // final response
							} catch (invokeError) {
								if (controller.signal.aborted) {
									break;
								}
								logger.error(
									invokeError,
									"[AgentLoop] Fallback invoke also failed",
								);
								break;
							}
						}

						let accumulatedMessage: AIMessageChunk | null = null;
						let streamBuf = "";
						let hasReasoned = false;
						let reasoningClosed = false;
						let prevClean = "";
						const thinkExtractor = new IncrementalThinkExtractor();

						for await (const chunk of stream) {
							if (!this.running || controller.signal.aborted) {
								assistantFinalResponse = stripThink(streamBuf);
								break;
							}

							if (accumulatedMessage === null) {
								accumulatedMessage = chunk;
							} else {
								accumulatedMessage = accumulatedMessage.concat(chunk);
							}

							// 1. Dedicated reasoning content (if supported by the provider)
							const rDelta = chunk.additional_kwargs?.reasoning_content as
								| string
								| undefined;
							if (rDelta) {
								hasReasoned = true;
								await this.bus.publishOutbound({
									channel: msg.channel,
									chat_id: msg.chat_id,
									content: rDelta,
									reply_to: replyTo,
									metadata: {
										_stream_id: streamId,
										_reasoning_delta: true,
										reply_to: replyTo,
									},
								});
							}

							// 2. Inline think tags in content
							const chunkText =
								typeof chunk.content === "string" ? chunk.content : "";
							if (chunkText) {
								streamBuf += chunkText;

								// Check for incremental thinking
								const [thinkingText] = extractThink(streamBuf);
								if (thinkingText) {
									hasReasoned = true;
									const newThink = thinkingText.substring(
										thinkExtractor.emitted.length,
									);
									if (newThink) {
										thinkExtractor.emitted = thinkingText;
										await this.bus.publishOutbound({
											channel: msg.channel,
											chat_id: msg.chat_id,
											content: newThink,
											reply_to: replyTo,
											metadata: {
												_stream_id: streamId,
												_reasoning_delta: true,
												reply_to: replyTo,
											},
										});
									}
								}

								// Check for incremental clean content
								const newClean = stripThink(streamBuf);
								const incremental = newClean.substring(prevClean.length);
								if (incremental) {
									if (hasReasoned && !reasoningClosed) {
										await this.bus.publishOutbound({
											channel: msg.channel,
											chat_id: msg.chat_id,
											content: "",
											reply_to: replyTo,
											metadata: {
												_stream_id: streamId,
												_reasoning_end: true,
												reply_to: replyTo,
											},
										});
										reasoningClosed = true;
									}
									prevClean = newClean;
									await this.bus.publishOutbound({
										channel: msg.channel,
										chat_id: msg.chat_id,
										content: incremental,
										reply_to: replyTo,
										metadata: {
											_stream_id: streamId,
											_stream_delta: true,
											reply_to: replyTo,
										},
									});
								}
							}
							assistantFinalResponse = stripThink(streamBuf);
						}

						if (controller.signal.aborted) {
							break;
						}

						if (hasReasoned && !reasoningClosed) {
							await this.bus.publishOutbound({
								channel: msg.channel,
								chat_id: msg.chat_id,
								content: "",
								reply_to: replyTo,
								metadata: {
									_stream_id: streamId,
									_reasoning_end: true,
									reply_to: replyTo,
								},
							});
							reasoningClosed = true;
						}

						if (accumulatedMessage) {
							activeMessages.push(accumulatedMessage);
							assistantFinalResponse = stripThink(streamBuf);

							const toolCalls = accumulatedMessage.tool_calls || [];
							if (toolCalls.length > 0) {
								const hintText = formatToolCallMessage(toolCalls);
								await this.bus.publishOutbound({
									channel: msg.channel,
									chat_id: msg.chat_id,
									content: hintText,
									metadata: {
										_stream_id: `tools-${streamId}`,
										_stream_delta: true,
										_overwrite: true,
									},
								});

								for (const tc of toolCalls) {
									if (controller.signal.aborted) {
										break;
									}
									const tool = toolsByName.get(tc.name);
									let result: string;
									const argsStr = JSON.stringify(tc.args);
									const truncatedArgs =
										argsStr.length > 150
											? `${argsStr.substring(0, 147)}...`
											: argsStr;
									logger.info(
										`[AgentLoop] Calling tool: ${tc.name} with args: ${truncatedArgs}`,
									);
									if (!tool) {
										result = `Error: Tool ${tc.name} is not available.`;
										logger.error(
											`[AgentLoop] Tool ${tc.name} is not available.`,
										);
									} else {
										try {
											result = await tool.invoke(tc.args);
											const truncatedResult =
												result.length > 200
													? `${result.substring(0, 197)}...`
													: result;
											logger.info(
												`[AgentLoop] Tool ${tc.name} returned: ${truncatedResult}`,
											);
										} catch (err) {
											const errorMsg =
												err instanceof Error ? err.message : String(err);
											result = `Error executing tool ${tc.name}: ${errorMsg}`;
											logger.error(
												err,
												`[AgentLoop] Tool ${tc.name} failed with error: ${errorMsg}`,
											);
										}
									}
									activeMessages.push(
										new ToolMessage({
											content: result,
											tool_call_id: tc.id ?? "",
											name: tc.name,
										}),
									);
								}
							} else {
								break; // Final response reached, no tool calls
							}
						} else {
							break;
						}
					}

					// Finalize stream
					await this.bus.publishOutbound({
						channel: msg.channel,
						chat_id: msg.chat_id,
						content: "",
						reply_to: replyTo,
						metadata: {
							_stream_id: streamId,
							_stream_end: true,
							reply_to: replyTo,
						},
					});

					// Finalize tools stream
					await this.bus.publishOutbound({
						channel: msg.channel,
						chat_id: msg.chat_id,
						content: "",
						metadata: {
							_stream_id: `tools-${streamId}`,
							_stream_end: true,
						},
					});

					if (assistantFinalResponse) {
						await history.appendMessage("assistant", assistantFinalResponse);
					}
				} catch (e) {
					if (
						controller.signal.aborted ||
						(e as Error)?.name === "AbortError" ||
						(e as Error)?.message?.includes("aborted")
					) {
						logger.info(
							`[AgentLoop] Execution aborted for chat ${msg.chat_id}`,
						);

						// Finalize streams if aborted mid-stream
						try {
							await this.bus.publishOutbound({
								channel: msg.channel,
								chat_id: msg.chat_id,
								content: "",
								reply_to: replyTo,
								metadata: {
									_stream_id: streamId,
									_stream_end: true,
									reply_to: replyTo,
								},
							});
						} catch {}
						try {
							await this.bus.publishOutbound({
								channel: msg.channel,
								chat_id: msg.chat_id,
								content: "",
								metadata: {
									_stream_id: `tools-${streamId}`,
									_stream_end: true,
								},
							});
						} catch {}

						if (assistantFinalResponse) {
							await history.appendMessage("assistant", assistantFinalResponse);
						}
					} else {
						throw e;
					}
				} finally {
					this.activeExecutions.delete(msg.chat_id);
				}
			} catch (e) {
				if (this.running) {
					logger.error(e, "[AgentLoop] Error processing inbound message");
				}
			}
		}
	}

	private coalesceInbound(batch: InboundMessage[]): InboundMessage {
		if (batch.length === 1) {
			return batch[0];
		}

		const first = batch[0];
		const last = batch[batch.length - 1];
		const mergedContent = batch
			.map((message) => message.content.trim())
			.filter((content) => content.length > 0)
			.join("\n");

		return {
			channel: first.channel,
			sender_id: first.sender_id,
			chat_id: first.chat_id,
			content: mergedContent || first.content,
			timestamp: last.timestamp ?? first.timestamp,
			metadata: {
				...(first.metadata ?? {}),
				...(last.metadata ?? {}),
				_batched_inbound: true,
				_batched_count: batch.length,
			},
		};
	}
}
