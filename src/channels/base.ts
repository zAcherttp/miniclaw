import type { MessageBus } from "@/bus/queue";

export abstract class Channel {
	protected bus: MessageBus;
	public running: boolean =
		false;

	constructor(
		bus: MessageBus,
	) {
		this.bus =
			bus;
	}

	abstract start(): Promise<void>;
	abstract stop(): Promise<void>;
	abstract sendMessage(
		chat_id: string,
		content: string,
		reply_to?: string,
	): Promise<void>;
}
