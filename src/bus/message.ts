export type MessageMetadataValue = string | number | boolean | null | undefined;
export type MessageMetadata = Record<string, MessageMetadataValue>;

export interface InboundMessage {
	channel: string;
	sender_id: string;
	chat_id: string;
	content: string;
	timestamp?: Date;
	metadata?: MessageMetadata;
}

/** Outbound message sent to external systems */
export interface OutboundMessage {
	channel: string;
	chat_id: string;
	content: string;
	reply_to?: string;
	metadata?: MessageMetadata;
}
