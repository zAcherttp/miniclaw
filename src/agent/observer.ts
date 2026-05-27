import type { MessageBus } from "@/bus/queue";

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

	/**
	 * Consumes message chunks from the agent/model stream in real-time,
	 * parsing content blocks (text and reasoning blocks) and publishing them.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Stream chunks can vary dynamically based on provider or streamMode
	async consume(stream: AsyncIterable<any>) {
		// biome-ignore lint/suspicious/noExplicitAny: accumulated can be any message block type returned by LangChain
		let accumulated: any = null;
		for await (const chunk of stream) {
			// In LangGraph streamMode: "messages", each item in the iterator can be [AIMessageChunk, metadata] or just AIMessageChunk
			let messageChunk = chunk;
			if (Array.isArray(chunk) && chunk.length > 0) {
				messageChunk = chunk[0];
			}

			if (!messageChunk) continue;

			if (accumulated === null) {
				accumulated = messageChunk;
			} else {
				accumulated = accumulated.concat(messageChunk);
			}

			// 1. Unified contentBlocks parsing (standard LangChain recommended approach)
			// biome-ignore lint/suspicious/noExplicitAny: contentBlocks is a dynamic runtime property on AIMessageChunk
			const contentBlocks = (messageChunk as any).contentBlocks;
			if (Array.isArray(contentBlocks) && contentBlocks.length > 0) {
				for (const block of contentBlocks) {
					if (block.type === "reasoning") {
						const rDelta = block.reasoning || block.text || "";
						if (rDelta) {
							this.hasReasoned = true;
							await this.bus.publishOutbound({
								channel: this.channel,
								chat_id: this.chatId,
								content: rDelta,
								reply_to: this.replyTo,
								metadata: {
									_stream_id: this.streamId,
									_reasoning_delta: true,
									reply_to: this.replyTo,
								},
							});
						}
					} else if (block.type === "text") {
						const tDelta = block.text || "";
						if (tDelta) {
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
								content: tDelta,
								reply_to: this.replyTo,
								metadata: {
									_stream_id: this.streamId,
									_stream_delta: true,
									reply_to: this.replyTo,
								},
							});
						}
					}
				}
			} else {
				// Fallback for standard models streaming plain text without contentBlocks
				const chunkText =
					typeof messageChunk.content === "string" ? messageChunk.content : "";
				if (chunkText) {
					await this.bus.publishOutbound({
						channel: this.channel,
						chat_id: this.chatId,
						content: chunkText,
						reply_to: this.replyTo,
						metadata: {
							_stream_id: this.streamId,
							_stream_delta: true,
							reply_to: this.replyTo,
						},
					});
				}
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

	async publishToolStart(toolNames: string[]) {
		const hintText = `⚙️ Calling ${toolNames.join(", ")}\n`;
		await this.bus.publishOutbound({
			channel: this.channel,
			chat_id: this.chatId,
			content: hintText,
			metadata: {
				_stream_id: `tools-${this.streamId}`,
				_stream_delta: true,
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
