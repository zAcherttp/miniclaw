import { Bot } from "grammy";
import type { InboundMessage } from "@/bus/message";
import type { MessageBus } from "@/bus/queue";
import { Channel } from "./base";

export class TelegramChannel extends Channel {
	private bot: Bot;

	// Stream status tracking
	private streamBufs = new Map<
		string,
		{
			text: string;
			message_id?: number;
			last_edit: number;
			stream_id?: string;
		}
	>();

	constructor(bus: MessageBus, token: string) {
		super(bus);
		this.bot = new Bot(token);

		this.bot.on("message:text", async (ctx) => {
			if (!this.running) return;

			const msg: InboundMessage = {
				channel: "telegram",
				chat_id: ctx.chat.id.toString(),
				sender_id: ctx.from?.id.toString() ?? "unknown",
				content: ctx.message.text,
				timestamp: new Date(ctx.message.date * 1000),
				metadata: {
					message_id: ctx.message.message_id.toString(),
				},
			};

			await this.bus.publishInbound(msg);
		});
	}

	async start(): Promise<void> {
		this.running = true;
		// Start in the background
		this.bot.start({
			onStart: (info) => {
				console.log(`[Telegram] Bot started as @${info.username}`);
			},
		});
	}

	async stop(): Promise<void> {
		this.running = false;
		await this.bot.stop();
	}

	async sendMessage(
		chat_id: string,
		content: string,
		reply_to?: string,
	): Promise<void> {
		const replyParams = reply_to
			? { reply_parameters: { message_id: parseInt(reply_to, 10) } }
			: undefined;
		await this.bot.api.sendMessage(chat_id, content, {
			...replyParams,
			parse_mode: "MarkdownV2", // Fallback to HTML if preferred later
		});
	}

	// Progressive streaming helpers (To be integrated into loop/messages)
	async sendMessageDraft(chat_id: string, initial_content: string = "...") {
		const chatInt = parseInt(chat_id, 10);
		const draftId = Math.floor(Math.random() * 1000000) + 1; // non-zero identifier

		await this.bot.api.sendMessageDraft(chatInt, draftId, initial_content, {
			parse_mode: "MarkdownV2",
		});

		this.streamBufs.set(chat_id, {
			text: initial_content,
			message_id: draftId, // store the draftId here
			last_edit: Date.now(),
		});
	}

	async updateStream(chat_id: string, chunk: string) {
		const buf = this.streamBufs.get(chat_id);
		if (!buf?.message_id) return;

		buf.text += chunk;

		const now = Date.now();
		if (now - buf.last_edit > 600) {
			// 600ms interval
			try {
				const chatInt = parseInt(chat_id, 10);
				await this.bot.api.sendMessageDraft(chatInt, buf.message_id, buf.text, {
					parse_mode: "MarkdownV2",
				});
				buf.last_edit = now;
			} catch (e) {
				console.warn("[Telegram] Stream edit failed:", e);
			}
		}
	}

	async finalizeStream(chat_id: string, reply_to?: string) {
		const buf = this.streamBufs.get(chat_id);
		if (!buf?.message_id) return;

		try {
			// Finalize: send the actual persistent message to the chat
			await this.sendMessage(chat_id, buf.text, reply_to);
		} catch (e) {
			console.warn("[Telegram] Final stream send failed:", e);
		}
		this.streamBufs.delete(chat_id);
	}
}
