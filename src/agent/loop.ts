import type { OutboundMessage } from "@/bus/message";
import type { MessageBus } from "@/bus/queue";
import type { AppConfig } from "@/config/schema";

export class AgentLoop {
	private config: AppConfig;
	private bus: MessageBus;
	public running: boolean =
		false;

	constructor(
		config: AppConfig,
		bus: MessageBus,
	) {
		this.config =
			config;
		this.bus =
			bus;
	}

	async start() {
		this.running = true;
		console.log(
			"[AgentLoop] Started with model " +
				this
					.config
					.agent
					.model,
		);

		// Background routines
		this.processInbound();
		this.processOutbound();
	}

	async stop() {
		this.running = false;
		console.log(
			"[AgentLoop] Stopped.",
		);
	}

	private async processInbound() {
		while (
			this
				.running
		) {
			try {
				const msg =
					await this.bus.consumeInbound();
				console.log(
					"[AgentLoop] Received from " +
						msg.channel +
						" (" +
						msg.chat_id +
						"): " +
						msg.content,
				);

				// TODO: Handle langchain execution here
				const responseText =
					"Echo from JS: " +
					msg.content;

				const out: OutboundMessage =
					{
						channel:
							msg.channel,
						chat_id:
							msg.chat_id,
						content:
							responseText,
						reply_to:
							msg
								.metadata
								?.message_id,
					};
				await this.bus.publishOutbound(
					out,
				);
			} catch (e) {
				console.error(
					"Error processing inbound message:",
					e,
				);
			}
		}
	}

	private async processOutbound() {
		while (
			this
				.running
		) {
			try {
				const msg =
					await this.bus.consumeOutbound();
				console.log(
					"[AgentLoop] Sending to " +
						msg.channel +
						" (" +
						msg.chat_id +
						"): " +
						msg.content,
				);
			} catch (e) {
				console.error(
					"Error processing outbound message:",
					e,
				);
			}
		}
	}
}
