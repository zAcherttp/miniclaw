import type { AgentLoop } from "@/agent/loop";
import type { OutboundMessage } from "@/bus/message";
import type { MessageBus } from "@/bus/queue";
import type { AppConfig } from "@/config/schema";
import { logger } from "@/utils/logger";
import type {
	Channel,
	ChannelBlockedAttemptEvent,
	ChannelInboundEvent,
} from "./base";
import { TelegramChannel } from "./telegram";

const SHUTDOWN_CHANNEL = "__system__";
const SHUTDOWN_CHAT = "__shutdown__";
const LOG_PREVIEW_LIMIT = 160;

export class ChannelManager {
	private readonly bus: MessageBus;
	private readonly channels = new Map<string, Channel>();
	private readonly outboundLogBufs = new Map<string, string>();
	private readonly agentLoop?: AgentLoop;
	private dispatchTask?: Promise<void>;
	private running = false;

	constructor(config: AppConfig, bus: MessageBus, agentLoop?: AgentLoop) {
		this.bus = bus;
		this.agentLoop = agentLoop;
		this.initChannels(config);
	}

	get enabledChannels(): string[] {
		return [...this.channels.keys()];
	}

	async startAll(): Promise<void> {
		if (this.running) return;
		this.running = true;
		this.dispatchTask = this.dispatchOutbound();

		for (const [name, channel] of this.channels.entries()) {
			logger.info(`[Channels] Starting ${name}...`);
			await channel.start();
		}
	}

	async stopAll(): Promise<void> {
		if (!this.running) return;
		this.running = false;

		await this.bus.publishOutbound({
			channel: SHUTDOWN_CHANNEL,
			chat_id: SHUTDOWN_CHAT,
			content: "",
			metadata: { _shutdown: true },
		});

		await this.dispatchTask;

		for (const [name, channel] of this.channels.entries()) {
			try {
				await channel.stop();
				logger.info(`[Channels] Stopped ${name}`);
			} catch (error) {
				logger.error(error, `[Channels] Failed to stop ${name}`);
			}
		}
	}

	private initChannels(config: AppConfig): void {
		const telegramConfig = config.channels.telegram;
		if (!telegramConfig.enabled) {
			return;
		}

		const token = telegramConfig.token || process.env.TELEGRAM_BOT_TOKEN;
		if (!token) {
			logger.warn(
				"[Channels] Telegram is enabled but no token was found. Set channels.telegram.token or TELEGRAM_BOT_TOKEN.",
			);
			return;
		}

		const channel = new TelegramChannel(
			this.bus,
			token,
			telegramConfig,
			this.agentLoop,
		);
		channel.onInboundMessage = (event) => {
			logger.info(`[Channels] Inbound message received from ${event.channel}`);
			this.logInbound(event);
		};
		channel.onBlockedAttempt = (event) => {
			logger.warn(`[Channels] Blocked attempt received from ${event.channel}`);
			this.logBlockedAttempt(event);
		};
		this.channels.set("telegram", channel);
	}

	private async dispatchOutbound(): Promise<void> {
		while (this.running) {
			try {
				const msg = await this.bus.consumeOutbound();
				if (!this.running || msg.metadata?._shutdown === true) {
					break;
				}

				const channel = this.channels.get(msg.channel);
				if (!channel) {
					logger.warn(
						`[Channels][BLOCKED] outbound unknown channel=${msg.channel} chat=${msg.chat_id} message="${this.truncateForLog(msg.content)}"`,
					);
					continue;
				}

				this.logOutbound(msg);
				await this.sendOnce(channel, msg);
			} catch (error) {
				if (this.running) {
					logger.error(error, "[Channels] Outbound dispatch error");
				}
			}
		}
	}

	private async sendOnce(
		channel: Channel,
		msg: OutboundMessage,
	): Promise<void> {
		const metadata = msg.metadata ?? {};
		if (metadata._reasoning_end === true) {
			await channel.sendReasoningEnd(msg.chat_id, metadata);
			return;
		}
		if (metadata._reasoning_delta === true) {
			await channel.sendReasoningDelta(msg.chat_id, msg.content, metadata);
			return;
		}
		if (metadata._reasoning === true) {
			await channel.sendReasoning(msg);
			return;
		}
		if (metadata._stream_delta === true || metadata._stream_end === true) {
			await channel.sendDelta(msg.chat_id, msg.content, metadata);
			return;
		}
		if (metadata._streamed === true) {
			return;
		}
		await channel.send(msg);
	}

	private logInbound(event: ChannelInboundEvent): void {
		logger.info(
			`[Channels][IN] channel=${event.channel} chat=${event.chat_id} sender=${event.sender_id} message="${this.truncateForLog(event.content)}"`,
		);
	}

	private logOutbound(msg: OutboundMessage): void {
		const metadata = msg.metadata ?? {};
		const isStream =
			metadata._stream_delta ||
			metadata._stream_end ||
			metadata._reasoning_delta ||
			metadata._reasoning_end;

		if (isStream) {
			const streamId =
				(typeof metadata._stream_id === "string" ? metadata._stream_id : "") ||
				`${msg.channel}:${msg.chat_id}:${metadata._reasoning_delta || metadata._reasoning_end ? "reasoning" : "stream"}`;
			let buf = this.outboundLogBufs.get(streamId) || "";
			buf += msg.content || "";

			if (metadata._stream_end || metadata._reasoning_end) {
				this.outboundLogBufs.delete(streamId);
				logger.info(
					`[Channels][OUT] channel=${msg.channel} chat=${msg.chat_id} message="${this.truncateForLog(buf)}" [streamed]`,
				);
			} else {
				this.outboundLogBufs.set(streamId, buf);
			}
			return;
		}

		logger.info(
			`[Channels][OUT] channel=${msg.channel} chat=${msg.chat_id} message="${this.truncateForLog(msg.content)}"`,
		);
	}

	private logBlockedAttempt(event: ChannelBlockedAttemptEvent): void {
		logger.warn(
			`[Channels][BLOCKED] inbound channel=${event.channel} chat=${event.chat_id} sender=${event.sender_id} message="${this.truncateForLog(event.content)}"`,
		);
	}

	private truncateForLog(content: string): string {
		const singleLine = content.replace(/\s+/g, " ").trim();
		if (!singleLine) {
			return "<empty>";
		}
		if (singleLine.length <= LOG_PREVIEW_LIMIT) {
			return singleLine;
		}
		return `${singleLine.slice(0, LOG_PREVIEW_LIMIT)}...`;
	}
}
