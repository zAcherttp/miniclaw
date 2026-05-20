import { Bot } from "grammy";
import type { MessageMetadata, OutboundMessage } from "@/bus/message";
import type { MessageBus } from "@/bus/queue";
import { logger } from "@/utils/logger";
import { Channel, type ChannelConfig } from "./base";

interface StreamBuffer {
	text: string;
	draft_id: number;
	last_edit: number;
}

export class TelegramChannel extends Channel {
	private bot: Bot;
	private readonly editIntervalMs = 600;
	private nextDraftId = 1;

	private streamBufs = new Map<string, StreamBuffer>();

	constructor(bus: MessageBus, token: string, config: ChannelConfig = {}) {
		super(bus, "telegram", config);
		this.bot = new Bot(token);

		this.bot.on("message:text", async (ctx) => {
			if (!this.running) return;

			await this.handleMessage({
				chatId: ctx.chat.id.toString(),
				senderId: ctx.from?.id.toString() ?? "unknown",
				content: ctx.message.text,
				timestamp: new Date(ctx.message.date * 1000),
				metadata: {
					message_id: ctx.message.message_id.toString(),
					sender_username: ctx.from?.username,
					sender_user_id: ctx.from?.id?.toString(),
				},
			});
		});
	}

	async start(): Promise<void> {
		if (this.running) return;
		this.setRunning(true);

		// Start in the background
		this.bot.start({
			onStart: (info) => {
				logger.info(`[Telegram] Bot started as @${info.username}`);
			},
		});
	}

	async stop(): Promise<void> {
		if (!this.running) return;
		this.setRunning(false);
		this.bot.stop();
	}

	async send(msg: OutboundMessage): Promise<void> {
		const reply = this.toReplyParameters(msg.reply_to);
		await this.bot.api.sendMessage(this.parseChatId(msg.chat_id), msg.content, {
			reply_parameters: reply,
		});
	}

	async sendDelta(
		chat_id: string,
		delta: string,
		metadata: MessageMetadata = {},
	): Promise<void> {
		const streamEnd = metadata._stream_end === true;

		const key = this.streamKey(chat_id, metadata);
		let buf = this.streamBufs.get(key);
		const chatId = this.parseNumericChatId(chat_id);

		if (!buf) {
			if (!delta && streamEnd) {
				return;
			}

			const text = delta || "...";
			const draftId = this.createDraftId();
			await this.bot.api.sendMessageDraft(chatId, draftId, text);
			buf = {
				text,
				draft_id: draftId,
				last_edit: Date.now(),
			};
			this.streamBufs.set(key, buf);
			if (streamEnd) {
				await this.send({
					channel: this.name,
					chat_id,
					content: buf.text,
					reply_to: this.replyToFromMetadata(metadata),
				});
				this.streamBufs.delete(key);
			}
			return;
		}

		if (delta) {
			buf.text += delta;
		}

		const now = Date.now();
		if (streamEnd || now - buf.last_edit >= this.editIntervalMs) {
			await this.bot.api.sendMessageDraft(
				chatId,
				buf.draft_id,
				buf.text || "...",
			);
			buf.last_edit = now;
		}

		if (streamEnd) {
			await this.send({
				channel: this.name,
				chat_id,
				content: buf.text,
				reply_to: this.replyToFromMetadata(metadata),
			});
			this.streamBufs.delete(key);
		}
	}

	async sendReasoningDelta(
		chat_id: string,
		delta: string,
		metadata: MessageMetadata = {},
	): Promise<void> {
		await this.sendDelta(chat_id, delta, {
			...metadata,
			_stream_id: this.reasoningStreamId(metadata),
		});
	}

	async sendReasoningEnd(
		chat_id: string,
		metadata: MessageMetadata = {},
	): Promise<void> {
		await this.sendDelta(chat_id, "", {
			...metadata,
			_stream_end: true,
			_stream_id: this.reasoningStreamId(metadata),
		});
	}

	private parseChatId(chat_id: string): string | number {
		const parsed = Number.parseInt(chat_id, 10);
		if (!Number.isNaN(parsed)) {
			return parsed;
		}
		return chat_id;
	}

	private parseNumericChatId(chat_id: string): number {
		const parsed = Number.parseInt(chat_id, 10);
		if (Number.isNaN(parsed)) {
			throw new Error(
				`sendMessageDraft requires numeric chat_id, got '${chat_id}'`,
			);
		}
		return parsed;
	}

	private toReplyParameters(
		reply_to?: string,
	): { message_id: number } | undefined {
		if (!reply_to) {
			return undefined;
		}
		const parsed = Number.parseInt(reply_to, 10);
		if (Number.isNaN(parsed)) {
			return undefined;
		}
		return { message_id: parsed };
	}

	private streamKey(chat_id: string, metadata: MessageMetadata): string {
		const streamId = metadata._stream_id;
		if (typeof streamId === "string" && streamId.length > 0) {
			return `${chat_id}:${streamId}`;
		}
		return chat_id;
	}

	private createDraftId(): number {
		const draftId = this.nextDraftId;
		this.nextDraftId =
			this.nextDraftId >= Number.MAX_SAFE_INTEGER ? 1 : this.nextDraftId + 1;
		return draftId;
	}

	private replyToFromMetadata(metadata: MessageMetadata): string | undefined {
		const replyTo = metadata.reply_to;
		if (typeof replyTo === "string") {
			return replyTo;
		}
		if (typeof replyTo === "number") {
			return replyTo.toString();
		}
		return undefined;
	}

	private reasoningStreamId(metadata: MessageMetadata): string {
		const streamId = metadata._stream_id;
		if (typeof streamId === "string" && streamId.length > 0) {
			return `reasoning:${streamId}`;
		}
		return "reasoning";
	}
}
