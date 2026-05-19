import type { InboundMessage } from "@/bus/message";
import type { MessageBus } from "@/bus/queue";
import type { AppConfig } from "@/config/schema";

const INBOUND_BATCH_MAX_CONTENT_LENGTH = 1200;
const INBOUND_BATCH_DEBOUNCE_MS = 250;

export class AgentLoop {
	private config: AppConfig;
	private bus: MessageBus;
	public running: boolean = false;
	private inboundTask?: Promise<void>;

	constructor(config: AppConfig, bus: MessageBus) {
		this.config = config;
		this.bus = bus;
	}

	async start() {
		if (this.running) return;
		this.running = true;
		console.log(`[AgentLoop] Started with model ${this.config.agent.model}`);

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
		console.log("[AgentLoop] Stopped.");
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
				console.log(
					"[AgentLoop] Received from " +
						msg.channel +
						" (" +
						msg.chat_id +
						"): " +
						msg.content +
						batchTag,
				);

				// TODO: Handle langchain execution here
				const responseText = `Echo from JS: ${msg.content}`;
				const messageId = msg.metadata?.message_id;
				const replyTo =
					typeof messageId === "string"
						? messageId
						: typeof messageId === "number"
							? messageId.toString()
							: undefined;

				const streamId = `echo-${Date.now()}`;
				const words = responseText.split(" ");
				for (let i = 0; i < words.length; i++) {
					const word = words[i] + (i < words.length - 1 ? " " : "");
					await this.bus.publishOutbound({
						channel: msg.channel,
						chat_id: msg.chat_id,
						content: word,
						reply_to: replyTo,
						metadata: {
							_stream_id: streamId,
							_stream_delta: true,
							reply_to: replyTo,
						},
					});
					await new Promise((resolve) => setTimeout(resolve, 100));
				}

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
			} catch (e) {
				if (this.running) {
					console.error("Error processing inbound message:", e);
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
