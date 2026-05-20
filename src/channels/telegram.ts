import fs from "node:fs";
import path from "node:path";
import { Bot } from "grammy";
import { SessionHistory } from "@/agent/history";
import type { AgentLoop } from "@/agent/loop";
import type { MessageMetadata, OutboundMessage } from "@/bus/message";
import type { MessageBus } from "@/bus/queue";
import { getAppDir, getMediaDir, getWorkspaceDir } from "@/config/paths";
import { logger } from "@/utils/logger";
import { Channel, type ChannelConfig } from "./base";

interface StreamBuffer {
	text: string;
	draft_id: number;
	last_edit: number;
	chat_id: string;
	metadata?: MessageMetadata;
}

export class TelegramChannel extends Channel {
	private bot: Bot;
	private readonly editIntervalMs = 600;
	private nextDraftId = 1;
	private readonly agentLoop?: AgentLoop;

	private streamBufs = new Map<string, StreamBuffer>();

	constructor(
		bus: MessageBus,
		token: string,
		config: ChannelConfig = {},
		agentLoop?: AgentLoop,
	) {
		super(bus, "telegram", config);
		this.agentLoop = agentLoop;
		this.bot = new Bot(token);

		this.bot.on("message", async (ctx) => {
			if (!this.running) return;

			let text = ctx.message.text ?? ctx.message.caption ?? "";
			const doc = ctx.message.document;

			// Intercept commands out-of-band
			const trimmedText = text.trim();
			if (trimmedText.startsWith("/")) {
				// Perform permission check
				const senderId = ctx.from?.id.toString() ?? "unknown";
				const username = ctx.from?.username;
				const isAllowed = this.isAllowed(senderId, {
					sender_username: username,
					sender_user_id: senderId,
				});

				if (!isAllowed) {
					this.onBlockedAttempt?.({
						channel: this.name,
						sender_id: senderId,
						chat_id: ctx.chat.id.toString(),
						content: text,
						metadata: {
							sender_username: username,
							sender_user_id: senderId,
						},
					});
					return;
				}

				const commandParts = trimmedText.split(/\s+/);
				const command = commandParts[0].toLowerCase();
				const chatId = ctx.chat.id.toString();

				if (command === "/stop") {
					if (this.agentLoop) {
						const cancelled = await this.agentLoop.cancelChat(chatId);
						if (cancelled) {
							await ctx.reply("Stopped active execution.");
						} else {
							await ctx.reply("No active task is running for this chat.");
						}
					} else {
						await ctx.reply("Agent loop not available.");
					}
					return;
				}

				if (command === "/new") {
					if (this.agentLoop) {
						await this.agentLoop.cancelChat(chatId);
					}
					const history = new SessionHistory(chatId);
					await history.archiveHistory();
					await ctx.reply(
						"New session started. Active history archived for periodic daily summary and consolidation.",
					);
					return;
				}

				if (command === "/clear") {
					if (this.agentLoop) {
						await this.agentLoop.cancelChat(chatId);
					}
					const history = new SessionHistory(chatId);
					await history.clearHistory();
					await ctx.reply("Session history wiped completely.");
					return;
				}

				if (command === "/status") {
					const history = new SessionHistory(chatId);
					const messages = await history.loadHistory(1000); // load all active messages for count
					const isActive = this.agentLoop
						? this.agentLoop.isChatActive(chatId)
						: false;
					const activeModel =
						this.agentLoop?.config?.agent?.model ||
						process.env.CHAT_MODEL ||
						"unknown";
					const workspace = this.agentLoop?.config?.workspace_dir || "unknown";

					const replyText = `✨ *Miniclaw Bot Status*\n\n🤖 *Active Model:* \`${activeModel}\`\n💬 *Active Message Count:* \`${messages.length}\`\n⚡ *Task Status:* \`${isActive ? "ACTIVE ⚡" : "IDLE 💤"}\`\n📁 *Workspace:* \`${workspace}\``;

					await ctx.reply(replyText, { parse_mode: "Markdown" });
					return;
				}

				if (command === "/help" || command === "/start") {
					const helpText = `✨ *Miniclaw Bot Commands Menu*\n\n/new - Start a fresh session (archives current history)\n/clear - Wipe active session history (archives preserved)\n/stop - Stop active running agent execution\n/status - View status of active model and session\n/help - Show this help menu`;
					await ctx.reply(helpText);
					return;
				}
			}

			if (doc) {
				const fileName = doc.file_name ?? "document";
				const isTextBased =
					fileName.endsWith(".txt") ||
					fileName.endsWith(".csv") ||
					fileName.endsWith(".md") ||
					fileName.endsWith(".json") ||
					fileName.endsWith(".js") ||
					fileName.endsWith(".ts") ||
					fileName.endsWith(".py") ||
					fileName.endsWith(".html") ||
					fileName.endsWith(".css") ||
					fileName.endsWith(".yaml") ||
					fileName.endsWith(".yml") ||
					(doc.mime_type &&
						(doc.mime_type.startsWith("text/") ||
							doc.mime_type === "application/json"));

				if (isTextBased) {
					try {
						const fileObj = await ctx.getFile();
						const fileUrl = `https://api.telegram.org/file/bot${token}/${fileObj.file_path}`;
						const response = await fetch(fileUrl);
						if (!response.ok) {
							throw new Error(`Failed to fetch file: ${response.statusText}`);
						}
						const buffer = await response.arrayBuffer();
						const targetDir = this.agentLoop
							? getWorkspaceDir(this.agentLoop.config.workspace_dir)
							: getMediaDir();
						const destPath = path.join(targetDir, fileName);
						await fs.promises.writeFile(destPath, Buffer.from(buffer));

						const username =
							ctx.from?.username ?? ctx.from?.first_name ?? "User";
						const attachmentNotice = `${username} attached ${fileName}`;
						text = text ? `${attachmentNotice}\n\n${text}` : attachmentNotice;
					} catch (err) {
						logger.error(err, `[Telegram] Failed to download file ${fileName}`);
					}
				} else {
					logger.info(`[Telegram] Deferring non-text file ${fileName}`);
				}
			}

			if (text) {
				await this.handleMessage({
					chatId: ctx.chat.id.toString(),
					senderId: ctx.from?.id.toString() ?? "unknown",
					content: text,
					timestamp: new Date(ctx.message.date * 1000),
					metadata: {
						message_id: ctx.message.message_id.toString(),
						sender_username: ctx.from?.username,
						sender_user_id: ctx.from?.id?.toString(),
						...(doc
							? {
									file_id: doc.file_id,
									file_name: doc.file_name,
									file_size: doc.file_size,
									mime_type: doc.mime_type,
									file_path: path.join(
										this.agentLoop
											? getWorkspaceDir(this.agentLoop.config.workspace_dir)
											: getMediaDir(),
										doc.file_name ?? "document",
									),
								}
							: {}),
					},
				});
			}
		});
	}

	private async saveStreamsToDisk(): Promise<void> {
		try {
			const filePath = path.join(getAppDir(), "telegram_streams.json");
			const data = JSON.stringify(Array.from(this.streamBufs.entries()));
			await fs.promises.writeFile(filePath, data, "utf-8");
		} catch (err) {
			logger.error(err, "[Telegram] Failed to save streams to disk");
		}
	}

	private async loadStreamsFromDisk(): Promise<void> {
		try {
			const filePath = path.join(getAppDir(), "telegram_streams.json");
			if (fs.existsSync(filePath)) {
				const content = await fs.promises.readFile(filePath, "utf-8");
				const entries = JSON.parse(content) as [string, StreamBuffer][];
				this.streamBufs = new Map<string, StreamBuffer>(entries);
			}
		} catch (err) {
			logger.error(err, "[Telegram] Failed to load streams from disk");
		}
	}

	async concludeStream(key: string, buf: StreamBuffer): Promise<void> {
		logger.info(`[Telegram] Concluding stream for key ${key}`);
		await this.send({
			channel: this.name,
			chat_id: buf.chat_id,
			content: buf.text || "...",
			reply_to: this.replyToFromMetadata(buf.metadata ?? {}),
		});
		this.streamBufs.delete(key);
		await this.saveStreamsToDisk();
	}

	private async recoverStreams(): Promise<void> {
		try {
			await this.loadStreamsFromDisk();
			if (this.streamBufs.size > 0) {
				logger.info(
					`[Telegram] Recovering ${this.streamBufs.size} streaming in-progress messages...`,
				);
				for (const [key, buf] of Array.from(this.streamBufs.entries())) {
					try {
						await this.concludeStream(key, buf);
					} catch (err) {
						logger.error(
							err,
							`[Telegram] Failed to conclude stream for key ${key} during recovery`,
						);
					}
				}
			}
		} catch (err) {
			logger.error(err, "[Telegram] Failed to recover streams");
		}
	}

	async start(): Promise<void> {
		if (this.running) return;
		this.setRunning(true);

		// Register native commands with Telegram API
		try {
			const commands = [
				{
					command: "new",
					description: "Start a fresh session (archive current history)",
				},
				{
					command: "clear",
					description: "Wipe active session history (archives preserved)",
				},
				{ command: "stop", description: "Stop active running agent execution" },
				{
					command: "status",
					description: "View status of active model and session",
				},
				{ command: "help", description: "Show help message" },
				{
					command: "start",
					description: "Show help message and welcome screen",
				},
			];
			await this.bot.api.setMyCommands(commands);
			logger.info(
				`[Telegram] Registered ${commands.length} commands to telegram bot`,
			);
		} catch (err) {
			logger.warn(
				`[Telegram] Failed to register native commands: ${(err as Error).message}`,
			);
		}

		// Recover and conclude any pending streams
		await this.recoverStreams();

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

		// Conclude active streams on stop
		if (this.streamBufs.size > 0) {
			logger.info(
				`[Telegram] Concluding ${this.streamBufs.size} active streams on stop...`,
			);
			for (const [key, buf] of Array.from(this.streamBufs.entries())) {
				try {
					await this.concludeStream(key, buf);
				} catch (err) {
					logger.error(
						err,
						`[Telegram] Failed to conclude stream for key ${key} during stop`,
					);
				}
			}
		}

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
				chat_id,
				metadata,
			};
			this.streamBufs.set(key, buf);
			await this.saveStreamsToDisk();
			if (streamEnd) {
				await this.send({
					channel: this.name,
					chat_id,
					content: buf.text,
					reply_to: this.replyToFromMetadata(metadata),
				});
				this.streamBufs.delete(key);
				await this.saveStreamsToDisk();
			}
			return;
		}

		if (delta) {
			if (metadata._overwrite === true) {
				buf.text = delta;
			} else {
				buf.text += delta;
			}
			await this.saveStreamsToDisk();
		}

		const now = Date.now();
		if (streamEnd || now - buf.last_edit >= this.editIntervalMs) {
			await this.bot.api.sendMessageDraft(
				chatId,
				buf.draft_id,
				buf.text || "...",
			);
			buf.last_edit = now;
			await this.saveStreamsToDisk();
		}

		if (streamEnd) {
			await this.send({
				channel: this.name,
				chat_id,
				content: buf.text,
				reply_to: this.replyToFromMetadata(metadata),
			});
			this.streamBufs.delete(key);
			await this.saveStreamsToDisk();
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
		const key = this.streamKey(chat_id, {
			...metadata,
			_stream_id: this.reasoningStreamId(metadata),
		});
		const buf = this.streamBufs.get(key);
		if (buf) {
			buf.text += "\n\n";
			const chatId = this.parseNumericChatId(chat_id);
			await this.bot.api.sendMessageDraft(chatId, buf.draft_id, buf.text);
			await this.saveStreamsToDisk();
		}
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
			return streamId;
		}
		return "stream";
	}
}
