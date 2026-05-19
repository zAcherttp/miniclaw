import type {
	InboundMessage,
	MessageMetadata,
	OutboundMessage,
} from "@/bus/message";
import type { MessageBus } from "@/bus/queue";

export interface ChannelConfig {
	streaming?: boolean;
	allowFrom?: string[];
	allow_from?: string[];
}

export interface HandleMessageInput {
	senderId: string;
	chatId: string;
	content: string;
	timestamp?: Date;
	metadata?: MessageMetadata;
}

export interface ChannelInboundEvent {
	channel: string;
	sender_id: string;
	chat_id: string;
	content: string;
	metadata?: MessageMetadata;
}

export interface ChannelBlockedAttemptEvent {
	channel: string;
	sender_id: string;
	chat_id: string;
	content: string;
	metadata?: MessageMetadata;
}

export abstract class Channel {
	protected readonly bus: MessageBus;
	protected readonly config: ChannelConfig;
	public readonly name: string;
	public onInboundMessage?: (event: ChannelInboundEvent) => void;
	public onBlockedAttempt?: (event: ChannelBlockedAttemptEvent) => void;
	private _running = false;

	constructor(bus: MessageBus, name: string, config: ChannelConfig = {}) {
		this.bus = bus;
		this.name = name;
		this.config = config;
	}

	get running(): boolean {
		return this._running;
	}

	protected setRunning(running: boolean): void {
		this._running = running;
	}

	abstract start(): Promise<void>;
	abstract stop(): Promise<void>;
	abstract send(msg: OutboundMessage): Promise<void>;

	async sendDelta(
		chat_id: string,
		delta: string,
		metadata: MessageMetadata = {},
	): Promise<void> {
		void chat_id;
		void delta;
		void metadata;
	}

	async sendReasoningDelta(
		chat_id: string,
		delta: string,
		metadata: MessageMetadata = {},
	): Promise<void> {
		void chat_id;
		void delta;
		void metadata;
	}

	async sendReasoningEnd(
		chat_id: string,
		metadata: MessageMetadata = {},
	): Promise<void> {
		void chat_id;
		void metadata;
	}

	async sendReasoning(msg: OutboundMessage): Promise<void> {
		if (!msg.content) {
			return;
		}

		const metadata: MessageMetadata = {
			...(msg.metadata ?? {}),
			_reasoning_delta: true,
		};
		await this.sendReasoningDelta(msg.chat_id, msg.content, metadata);

		const endMetadata: MessageMetadata = {
			...metadata,
			_reasoning_end: true,
		};
		delete endMetadata._reasoning_delta;
		await this.sendReasoningEnd(msg.chat_id, endMetadata);
	}

	get supportsStreaming(): boolean {
		return (
			Boolean(this.config.streaming) &&
			this.sendDelta !== Channel.prototype.sendDelta
		);
	}

	isAllowed(sender_id: string, metadata: MessageMetadata = {}): boolean {
		const allowList = this.config.allowFrom ?? this.config.allow_from ?? [];
		const normalizedAllowList = allowList
			.map((entry) => this.normalizeAllowToken(entry))
			.filter((entry): entry is string => entry !== undefined);
		if (normalizedAllowList.includes("*")) {
			return true;
		}

		const senderTokens = this.getSenderTokens(sender_id, metadata);
		return normalizedAllowList.some((allowed) => senderTokens.has(allowed));
	}

	protected async handleMessage(input: HandleMessageInput): Promise<void> {
		if (!this.isAllowed(input.senderId, input.metadata ?? {})) {
			this.onBlockedAttempt?.({
				channel: this.name,
				sender_id: String(input.senderId),
				chat_id: String(input.chatId),
				content: input.content,
				metadata: input.metadata,
			});
			return;
		}

		const metadata = this.supportsStreaming
			? { ...(input.metadata ?? {}), _wants_stream: true }
			: input.metadata;
		const message: InboundMessage = {
			channel: this.name,
			sender_id: String(input.senderId),
			chat_id: String(input.chatId),
			content: input.content,
			timestamp: input.timestamp,
			metadata,
		};
		this.onInboundMessage?.({
			channel: message.channel,
			sender_id: message.sender_id,
			chat_id: message.chat_id,
			content: message.content,
			metadata: message.metadata,
		});
		await this.bus.publishInbound(message);
	}

	private getSenderTokens(
		sender_id: string,
		metadata: MessageMetadata,
	): Set<string> {
		const tokens = new Set<string>();
		this.addNormalizedToken(tokens, sender_id);
		this.addNormalizedToken(tokens, metadata.sender_username);
		this.addNormalizedToken(tokens, metadata.username);
		this.addNormalizedToken(tokens, metadata.user_id);
		this.addNormalizedToken(tokens, metadata.sender_user_id);
		return tokens;
	}

	private addNormalizedToken(
		tokens: Set<string>,
		value: MessageMetadata[keyof MessageMetadata],
	): void {
		if (typeof value === "string") {
			const normalized = this.normalizeAllowToken(value);
			if (normalized) {
				tokens.add(normalized);
			}
			return;
		}
		if (typeof value === "number") {
			const normalized = this.normalizeAllowToken(value.toString());
			if (normalized) {
				tokens.add(normalized);
			}
		}
	}

	private normalizeAllowToken(value: string): string | undefined {
		const trimmed = value.trim();
		if (!trimmed) {
			return undefined;
		}
		if (trimmed === "*") {
			return "*";
		}

		const withoutMentions = trimmed.replace(/^@+/, "");
		if (!withoutMentions) {
			return undefined;
		}
		return withoutMentions.toLowerCase();
	}
}
