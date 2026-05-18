export interface InboundMessage {
	channel: string;
	sender_id: string;
	chat_id: string;
	content: string;
	timestamp?: Date;
	metadata?: Record<string, string | undefined>;
}

/** Outbound message sent to external systems */
export interface OutboundMessage {
	channel: string;
	chat_id: string;
	content: string;
	reply_to?: string;
	metadata?: Record<string, string | undefined>;
}
