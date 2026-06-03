import fs from "node:fs";
import path from "node:path";
import { Bot } from "grammy";
import type { AgentLoop } from "@/agent/loop";
import { forceCompactMessages, getSessionMessages } from "@/agent/loop";
import { MemoryManager } from "@/agent/memory";
import { StateManager } from "@/agent/state";
import { FileCheckpointSaver } from "@/agent/store";
import { estimateMessagesTokens, formatTokens } from "@/agent/tokenizer";
import type { MessageMetadata, OutboundMessage } from "@/bus/message";
import type { MessageBus } from "@/bus/queue";
import { getMediaDir, getWorkspaceDir } from "@/config/paths";
import { logger } from "@/utils/logger";
import { Channel, type ChannelConfig, type HandleMessageInput } from "./base";

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
	private turnStartTimes = new Map<string, number>();
	private toolStreams = new Map<
		string,
		{
			toolCounts: Map<string, number>;
			draftId: number;
			lastEdit: number;
		}
	>();

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
					logger.info(`[Telegram] /stop command received for chat ${chatId}`);
					if (this.agentLoop) {
						const cancelled = await this.agentLoop.cancelChat(chatId);
						logger.info(
							`[Telegram] /stop execution cancel status: cancelled=${cancelled}`,
						);
						if (cancelled) {
							await ctx.reply("Stopped active execution.");
						} else {
							await ctx.reply("No active task is running for this chat.");
						}
					} else {
						logger.warn(
							`[Telegram] /stop skipped: agentLoop is not available.`,
						);
						await ctx.reply("Agent loop not available.");
					}
					return;
				}

				if (command === "/new") {
					logger.info(`[Telegram] /new command received for chat ${chatId}`);
					if (this.agentLoop) {
						await this.agentLoop.cancelChat(chatId);
					}
					const checkpointer = new FileCheckpointSaver(chatId);
					await checkpointer.load();
					logger.info(
						`[Telegram] Loaded checkpoint messages for /new: count=${checkpointer.messages.length}, chatId=${chatId}`,
					);
					logger.info(
						`[Telegram] agentLoop present: ${!!this.agentLoop}, config present: ${!!this.agentLoop?.config}`,
					);

					// Consolidation: Run session auto-summarization before archiving
					if (this.agentLoop?.config && checkpointer.messages.length > 0) {
						try {
							logger.info(
								`[Telegram] Triggering memory consolidation with ${checkpointer.messages.length} messages.`,
							);
							const memoryManager = MemoryManager.getInstance(
								this.agentLoop.config,
							);
							await memoryManager.runDailySummarization(checkpointer.messages);
						} catch (err) {
							logger.error(
								err,
								"[Telegram] Failed to run summarization before session archive",
							);
						}
					} else {
						logger.info(
							`[Telegram] Skipping consolidation. Condition check: agentLoop=${!!this.agentLoop}, config=${!!this.agentLoop?.config}, messagesCount=${checkpointer.messages.length}`,
						);
					}

					await checkpointer.archive();
					await ctx.reply(
						"New session started. Active history archived for periodic daily summary and consolidation.",
					);
					return;
				}

				if (command === "/clear") {
					logger.info(`[Telegram] /clear command received for chat ${chatId}`);
					if (this.agentLoop) {
						await this.agentLoop.cancelChat(chatId);
					}
					const checkpointer = new FileCheckpointSaver(chatId);
					await checkpointer.clear();
					logger.info(`[Telegram] Session history wiped for chat ${chatId}`);
					await ctx.reply("Session history wiped completely.");
					return;
				}

				if (command === "/compact") {
					logger.info(
						`[Telegram] /compact command received for chat ${chatId}`,
					);
					if (this.agentLoop) {
						await this.agentLoop.cancelChat(chatId);
					}
					const checkpointer = new FileCheckpointSaver(chatId);
					await checkpointer.load();
					logger.info(
						`[Telegram] Loaded checkpoint messages for /compact: count=${checkpointer.messages.length}, chatId=${chatId}`,
					);

					if (checkpointer.messages.length === 0) {
						logger.info(`[Telegram] /compact skipped: no messages to compact.`);
						await ctx.reply("No messages to compact in the active session.");
						return;
					}

					if (this.agentLoop?.config) {
						try {
							const tokensBefore = estimateMessagesTokens(
								checkpointer.messages,
							);
							const triggerTokens =
								this.agentLoop.config.agent.compaction_trigger_tokens ?? 220000;
							logger.info(
								`[Telegram] Triggering manual conversation compaction.`,
							);
							const result = await forceCompactMessages(
								this.agentLoop.config,
								checkpointer.messages,
							);
							if (result) {
								checkpointer.messages = result.compacted;
								await checkpointer.save();
								const tokensAfter = estimateMessagesTokens(result.compacted);
								logger.info(`[Telegram] Conversation compacted successfully.`);
								let replyMsg = `conversation compacted: ${formatTokens(tokensBefore)} tokens to ${formatTokens(tokensAfter)} tokens / ${formatTokens(triggerTokens)}`;
								if (result.newWorkflow) {
									replyMsg += `\n\nDiscovered new workflow: ${result.newWorkflow}`;
								}
								await ctx.reply(replyMsg);
							} else {
								await ctx.reply("Failed to compact conversation.");
							}
						} catch (err) {
							logger.error(err, "[Telegram] Failed to compact conversation");
							await ctx.reply(
								`Failed to compact conversation: ${(err as Error).message}`,
							);
						}
					} else {
						logger.warn(
							`[Telegram] /compact skipped: agentLoop or config is not available.`,
						);
						await ctx.reply("Agent loop not available for compaction.");
					}
					return;
				}

				if (command === "/status") {
					logger.info(`[Telegram] /status command received for chat ${chatId}`);
					const messages = await getSessionMessages(chatId); // load all active messages from checkpoint
					const isActive = this.agentLoop
						? this.agentLoop.isChatActive(chatId)
						: false;
					const activeModel =
						this.agentLoop?.config?.agent?.model ||
						process.env.CHAT_MODEL ||
						"unknown";
					const reasoningEffort =
						this.agentLoop?.config?.agent?.reasoning_effort || "none";
					const workspace = this.agentLoop?.config?.workspace_dir || "unknown";

					const replyText = `✨ *Miniclaw Bot Status*\n\n🤖 *Active Model:* \`${activeModel}\`\n🧠 *Reasoning Setting:* \`${reasoningEffort}\`\n💬 *Active Message Count:* \`${messages.length}\`\n⚡ *Task Status:* \`${isActive ? "ACTIVE ⚡" : "IDLE 💤"}\`\n📁 *Workspace:* \`${workspace}\``;

					logger.info(
						`[Telegram] Status details printed: activeModel=${activeModel}, messagesCount=${messages.length}, isActive=${isActive}`,
					);
					await ctx.reply(toMarkdownV2(replyText), {
						parse_mode: "MarkdownV2",
					});
					return;
				}

				if (command === "/help" || command === "/start") {
					logger.info(
						`[Telegram] ${command} command received for chat ${chatId}`,
					);
					const helpText = `✨ *Miniclaw Bot Commands Menu*\n\n/new - Start a fresh session (archives current history)\n/clear - Wipe active session history (archives preserved)\n/compact - Compact conversation history (summarizes old messages)\n/stop - Stop active running agent execution\n/status - View status of active model and session\n/help - Show this help menu`;
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
						const targetDir = getMediaDir(
							this.agentLoop
								? getWorkspaceDir(this.agentLoop.config.workspace_dir)
								: undefined,
						);
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
										getMediaDir(
											this.agentLoop
												? getWorkspaceDir(this.agentLoop.config.workspace_dir)
												: undefined,
										),
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
			const entries = Array.from(this.streamBufs.entries()).map(
				([key, buf]) => {
					return [
						key,
						{
							...buf,
							text: "", // Clear the text buffer to keep disk writes lightweight
						},
					];
				},
			);
			await StateManager.saveTelegramStreams(entries);
		} catch (err) {
			logger.error(err, "[Telegram] Failed to save streams to StateManager");
		}
	}

	private async loadStreamsFromDisk(): Promise<void> {
		try {
			const entries = await StateManager.getTelegramStreams();
			this.streamBufs = new Map<string, StreamBuffer>(
				entries as unknown as Array<[string, StreamBuffer]>,
			);
		} catch (err) {
			logger.error(err, "[Telegram] Failed to load streams from StateManager");
		}
	}

	async concludeStream(key: string, buf: StreamBuffer): Promise<void> {
		logger.info(`[Telegram] Concluding stream for key ${key}`);
		let attempt = 0;
		let delay = 1000;
		while (true) {
			try {
				await this.send({
					channel: this.name,
					chat_id: buf.chat_id,
					content: buf.text || "...",
					reply_to: this.replyToFromMetadata(buf.metadata ?? {}),
				});
				break;
			} catch (err) {
				attempt++;
				logger.error(
					err,
					`[Telegram] Failed to conclude stream for key ${key} (attempt ${attempt}).`,
				);
				const errMsg = (err as Error)?.message || "";
				if (
					errMsg.includes("Bad Request") &&
					!errMsg.includes("can't parse entities")
				) {
					break; // Break on permanent non-parse-mode bad requests
				}
				if (attempt >= 5) {
					throw err;
				}
				await new Promise((resolve) => setTimeout(resolve, delay));
				delay *= 2;
			}
		}
		this.streamBufs.delete(key);
		await this.saveStreamsToDisk();

		// Conclude tool hints stream if exists
		const chatId = buf.chat_id;
		if (!key.includes("tools-")) {
			await this.concludeToolHintMessage(chatId);
		}
	}

	private async concludeToolHintMessage(chat_id: string): Promise<void> {
		const toolStream = this.toolStreams.get(chat_id);
		if (!toolStream) {
			return;
		}

		const turnStartTime = this.turnStartTimes.get(chat_id);
		const elapsedMs = turnStartTime ? Date.now() - turnStartTime : 0;
		const elapsedSec = Math.max(1, Math.round(elapsedMs / 1000));
		let timeStr = "";
		if (elapsedSec >= 60) {
			const minutes = (elapsedSec / 60).toFixed(1);
			timeStr = `${minutes} minutes`;
		} else {
			timeStr = `${elapsedSec} seconds`;
		}

		const escapeHtml = (str: string) => {
			return str
				.replace(/&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;");
		};

		const escapedText = escapeHtml(toolStream.text.trim());
		const finalContent = `Worked for ${timeStr}\n<blockquote expandable>\n${escapedText}\n</blockquote>`;

		try {
			await this.send({
				channel: this.name,
				chat_id,
				content: finalContent,
				metadata: { parse_mode: "HTML" },
			});
		} catch (err) {
			logger.error(
				err,
				`[Telegram] Failed to conclude tool hint message for chat ${chat_id}`,
			);
		} finally {
			this.toolStreams.delete(chat_id);
			this.turnStartTimes.delete(chat_id);
		}
	}

	private async recoverStreams(): Promise<void> {
		try {
			await this.loadStreamsFromDisk();
			if (this.streamBufs.size > 0) {
				logger.info(
					`[Telegram] Discarding ${this.streamBufs.size} orphaned streaming message states on startup (retry loop will handle active request)...`,
				);
				this.streamBufs.clear();
				await this.saveStreamsToDisk();
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
				{
					command: "compact",
					description: "Compact active conversation history using middleware",
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

	protected override async handleMessage(
		input: HandleMessageInput,
	): Promise<void> {
		this.turnStartTimes.set(input.chatId, Date.now());
		await super.handleMessage(input);
	}

	async send(msg: OutboundMessage): Promise<void> {
		const reply = this.toReplyParameters(msg.reply_to);
		const parseMode =
			msg.metadata?.parse_mode === "HTML" ? "HTML" : "MarkdownV2";
		const formattedText =
			parseMode === "HTML" ? msg.content : toMarkdownV2(msg.content);
		try {
			await this.bot.api.sendMessage(
				this.parseChatId(msg.chat_id),
				formattedText,
				{
					parse_mode: parseMode,
					reply_parameters: reply,
				},
			);
		} catch (err) {
			const errMsg = (err as Error)?.message || "";
			if (
				errMsg.includes("can't parse entities") ||
				errMsg.includes("parse_mode") ||
				(err as { description?: string })?.description?.includes(
					"can't parse entities",
				)
			) {
				logger.warn(
					err,
					`[Telegram] Failed to send message with parse_mode ${parseMode} for chat ${msg.chat_id}. Falling back to plain text.`,
				);
				await this.bot.api.sendMessage(
					this.parseChatId(msg.chat_id),
					msg.content,
					{
						reply_parameters: reply,
					},
				);
			} else {
				throw err;
			}
		}
	}

	async sendDelta(
		chat_id: string,
		delta: string,
		metadata: MessageMetadata = {},
	): Promise<void> {
		const streamEnd = metadata._stream_end === true;
		const streamId = metadata._stream_id;
		const isToolStream =
			typeof streamId === "string" && streamId.startsWith("tools-");
		const chatId = this.parseNumericChatId(chat_id);

		if (isToolStream) {
			let toolStream = this.toolStreams.get(chat_id);
			if (!toolStream) {
				if (!delta && streamEnd) {
					return;
				}
				const text = delta || "...";
				const draftId = this.createDraftId();
				await this.bot.api.sendMessageDraft(chatId, draftId, text);
				toolStream = {
					text,
					toolCounts: new Map<string, number>(),
					draftId,
					lastEdit: Date.now(),
				};
				this.toolStreams.set(chat_id, toolStream);
			} else {
				if (delta) {
					if (metadata._overwrite === true) {
						toolStream.text = delta;
					} else {
						toolStream.text += delta;
					}
				}
			}

			// Update tool counts
			if (Array.isArray(metadata._tool_names)) {
				for (const name of metadata._tool_names) {
					const count = toolStream.toolCounts.get(name) || 0;
					toolStream.toolCounts.set(name, count + 1);
				}
			}

			const now = Date.now();
			if (streamEnd || now - toolStream.lastEdit >= this.editIntervalMs) {
				await this.bot.api.sendMessageDraft(
					chatId,
					toolStream.draftId,
					toolStream.text || "...",
				);
				toolStream.lastEdit = now;
			}
			return;
		}

		const key = this.streamKey(chat_id, metadata);
		let buf = this.streamBufs.get(key);

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
				await this.concludeToolHintMessage(chat_id);
			}
			return;
		}

		if (delta) {
			if (metadata._overwrite === true) {
				buf.text = delta;
			} else {
				buf.text += delta;
			}
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
			await this.saveStreamsToDisk();
			await this.concludeToolHintMessage(chat_id);
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

export function toMarkdownV2(text: string): string {
	let result = "";
	let i = 0;

	// Escape function for regular text
	const escapeText = (str: string) => {
		return str.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
	};

	const escapePreCode = (str: string) => {
		return str.replace(/[`\\]/g, "\\$&");
	};

	const escapeInlineCode = (str: string) => {
		return str.replace(/[`\\]/g, "\\$&");
	};

	const escapeUrl = (str: string) => {
		return str.replace(/[)\\]/g, "\\$&");
	};

	while (i < text.length) {
		const isStartOfLine = i === 0 || text[i - 1] === "\n";

		// Helper to find closing tag on the same line
		const getSameLineEnd = (marker: string, startIdx: number) => {
			const nextNewline = text.indexOf("\n", startIdx);
			const searchLimit = nextNewline === -1 ? text.length : nextNewline;
			const sub = text.substring(0, searchLimit);
			return sub.indexOf(marker, startIdx);
		};

		// 1. Code blocks (```)
		if (text.startsWith("```", i)) {
			const end = text.indexOf("```", i + 3);
			if (end !== -1) {
				const block = text.substring(i + 3, end);
				const newlineIdx = block.indexOf("\n");
				let lang = "";
				let code = block;
				if (newlineIdx !== -1 && newlineIdx < 15) {
					lang = block.substring(0, newlineIdx).trim();
					code = block.substring(newlineIdx + 1);
				}
				result += `\`\`\`${lang}\n${escapePreCode(code)}\`\`\``;
				i = end + 3;
				continue;
			}
		}

		// 2. Inline code (`)
		if (text.startsWith("`", i)) {
			const end = getSameLineEnd("`", i + 1);
			if (end !== -1 && end > i + 1) {
				const code = text.substring(i + 1, end);
				result += `\`${escapeInlineCode(code)}\``;
				i = end + 1;
				continue;
			}
		}

		// 3. Bold (**bold**)
		if (text.startsWith("**", i)) {
			const end = getSameLineEnd("**", i + 2);
			if (end !== -1 && end > i + 2) {
				const boldContent = text.substring(i + 2, end);
				// Bold in MarkdownV2 is single *
				result += `*${toMarkdownV2(boldContent)}*`;
				i = end + 2;
				continue;
			}
		}

		// 4. Bold / Underline (__bold__ or __underline__)
		if (text.startsWith("__", i)) {
			const end = getSameLineEnd("__", i + 2);
			if (end !== -1 && end > i + 2) {
				const content = text.substring(i + 2, end);
				result += `__${toMarkdownV2(content)}__`;
				i = end + 2;
				continue;
			}
		}

		// 5. Italic (*italic*)
		if (text.startsWith("* ", i) && isStartOfLine) {
			result += "\\* ";
			i += 2;
			continue;
		}

		if (text.startsWith("*", i)) {
			const end = getSameLineEnd("*", i + 1);
			if (end !== -1 && end > i + 1) {
				const italicContent = text.substring(i + 1, end);
				// Italic in MarkdownV2 is single _
				result += `_${toMarkdownV2(italicContent)}_`;
				i = end + 1;
				continue;
			}
		}

		// 6. Italic (_italic_)
		if (text.startsWith("_", i)) {
			const end = getSameLineEnd("_", i + 1);
			if (end !== -1 && end > i + 1) {
				const italicContent = text.substring(i + 1, end);
				result += `_${toMarkdownV2(italicContent)}_`;
				i = end + 1;
				continue;
			}
		}

		// 7. Strikethrough (~strikethrough~)
		if (text.startsWith("~", i)) {
			const end = getSameLineEnd("~", i + 1);
			if (end !== -1 && end > i + 1) {
				const strikethroughContent = text.substring(i + 1, end);
				result += `~${toMarkdownV2(strikethroughContent)}~`;
				i = end + 1;
				continue;
			}
		}

		// 8. Link [label](url)
		if (text.startsWith("[", i)) {
			const closeBracket = getSameLineEnd("]", i + 1);
			if (
				closeBracket !== -1 &&
				closeBracket > i + 1 &&
				text.startsWith("(", closeBracket + 1)
			) {
				const closeParen = getSameLineEnd(")", closeBracket + 2);
				if (closeParen !== -1 && closeParen > closeBracket + 2) {
					const label = text.substring(i + 1, closeBracket);
					const url = text.substring(closeBracket + 2, closeParen);
					result += `[${toMarkdownV2(label)}](${escapeUrl(url)})`;
					i = closeParen + 1;
					continue;
				}
			}
		}

		// 9. Standard list item marker (- )
		if (text.startsWith("- ", i) && isStartOfLine) {
			result += "\\- ";
			i += 2;
			continue;
		}

		// 10. Standard list item marker (+ )
		if (text.startsWith("+ ", i) && isStartOfLine) {
			result += "\\+ ";
			i += 2;
			continue;
		}

		// 11. Numeric list item marker (e.g. 1. )
		const numericListMatch = text.substring(i).match(/^(\d+)\.\s/);
		if (numericListMatch && isStartOfLine) {
			const numStr = numericListMatch[1];
			result += `${numStr}\\. `;
			i += numStr.length + 2;
			continue;
		}

		// 12. Normal character
		result += escapeText(text[i]);
		i++;
	}

	return result;
}
