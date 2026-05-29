import { type BaseMessage, HumanMessage } from "@langchain/core/messages";
import { summarizationMiddleware } from "langchain";
import type { InboundMessage } from "@/bus/message";
import type { MessageBus } from "@/bus/queue";
import { getWorkspaceDir } from "@/config/paths";
import type { AppConfig } from "@/config/schema";
import { logger } from "@/utils/logger";
import { createMainAgent } from "./agents";
import { compiledGraph } from "./graph";
import { MemoryManager } from "./memory";
import { applyMessageUpdates, isBeforeModelMiddleware } from "./middleware";
import { AgentEventObserver } from "./observer";
import { TaskScheduler } from "./scheduler";
import { StateManager } from "./state";
import { FileCheckpointSaver } from "./store";

const INBOUND_BATCH_MAX_CONTENT_LENGTH = 1200;
const INBOUND_BATCH_DEBOUNCE_MS = 250;

export const DEFAULT_SYSTEM_PROMPT = `You are a deep agent, codename miniclaw, an AI assistant that helps users accomplish tasks using tools. You respond with text and tool calls. The user can see your responses and tool outputs in real time.

## Core Behavior
- Be concise and direct. Don't over-explain unless asked.
- NEVER add unnecessary preamble ( "Sure!", "Great question!", "I'll now..." ).
- Don't say "I'll now do X" — just do it.
- If the request is underspecified, ask only the minimum followup needed to take the next useful action.

## Progress Updates
For longer tasks, provide brief progress updates at reasonable intervals — a concise sentence recapping what you've done and what's next.`;

export class AgentLoop {
	public readonly config: AppConfig;
	private bus: MessageBus;
	public running: boolean = false;
	private inboundTask?: Promise<void>;
	private activeExecutions = new Map<
		string,
		{ abortController: AbortController }
	>();
	private scheduler: TaskScheduler | null = null;

	constructor(config: AppConfig, bus: MessageBus) {
		this.config = config;
		this.bus = bus;
		globalThis.messageBus = bus;
	}

	async cancelChat(chatId: string): Promise<boolean> {
		const active = this.activeExecutions.get(chatId);
		if (active) {
			active.abortController.abort();
			this.activeExecutions.delete(chatId);
			return true;
		}
		return false;
	}

	isChatActive(chatId: string): boolean {
		return this.activeExecutions.has(chatId);
	}

	async start() {
		if (this.running) return;
		this.running = true;
		logger.info(`[AgentLoop] Started with model ${this.config.agent.model}`);

		const workspaceDir = getWorkspaceDir(this.config.workspace_dir);
		this.scheduler = TaskScheduler.getInstance(this.bus, workspaceDir);
		await this.scheduler.start();

		this.inboundTask = this.processInbound();
	}

	async stop() {
		if (!this.running) return;
		this.running = false;
		if (this.scheduler) {
			await this.scheduler.stop();
		}
		await this.bus.publishInbound({
			channel: "__system__",
			sender_id: "__system__",
			chat_id: "__shutdown__",
			content: "",
			metadata: { _shutdown: true },
		});
		await this.inboundTask;
		logger.info("[AgentLoop] Stopped.");
	}

	private async processInbound() {
		while (this.running) {
			try {
				const batch = await this.bus.consumeInboundBatch({
					maxCombinedContentLength: INBOUND_BATCH_MAX_CONTENT_LENGTH,
					debounceMs: INBOUND_BATCH_DEBOUNCE_MS,
				});
				const first = batch[0];
				if (!this.running || first.metadata?._shutdown === true) {
					break;
				}
				const msg = this.coalesceInbound(batch);

				// Persist active chat session details for out-of-band programmatic pings
				if (
					msg.channel &&
					msg.chat_id &&
					msg.chat_id !== "__shutdown__" &&
					msg.channel !== "__system__"
				) {
					const activeSession = {
						channel: msg.channel,
						chatId: msg.chat_id,
						timestamp: new Date().toISOString(),
					};
					try {
						await StateManager.saveLastActiveChat(activeSession);
					} catch (err) {
						logger.error(
							err,
							"[AgentLoop] Failed to save last active chat to StateManager",
						);
					}
				}

				const batchTag = batch.length > 1 ? ` [batched x${batch.length}]` : "";
				logger.info(
					`[AgentLoop] Received from ${msg.channel} (${msg.chat_id}): ${msg.content}${batchTag}`,
				);

				const controller = new AbortController();
				this.activeExecutions.set(msg.chat_id, { abortController: controller });

				const workspaceDir = getWorkspaceDir(this.config.workspace_dir);
				const checkpointer = new FileCheckpointSaver(msg.chat_id);
				await checkpointer.load();

				const replyTo = msg.metadata?.message_id?.toString();
				const streamId = `agent-${Date.now()}`;

				try {
					const agent = await createMainAgent(
						this.config,
						workspaceDir,
						this.bus,
					);
					const model = agent.options.model;
					const tools = agent.options.tools || [];

					// Append user message to history
					checkpointer.messages.push(new HumanMessage(msg.content));
					await checkpointer.save();

					// Daily Cron: check if we should run auto-summarization/profiling
					try {
						const memoryManager = MemoryManager.getInstance(this.config);
						await memoryManager.runDailyCronIfNeeded(checkpointer.messages);
					} catch (err) {
						logger.error(
							err,
							"[AgentLoop] Failed during daily cron memory update",
						);
					}

					// Create decoupled Event Observer
					const observer = new AgentEventObserver(
						this.bus,
						msg.chat_id,
						msg.channel,
						replyTo,
						streamId,
					);

					// Execute using declarative LangGraph StateGraph
					await compiledGraph.invoke(
						{ messages: checkpointer.messages },
						{
							configurable: {
								workspaceDir,
								agentModel: model,
								agentTools: tools,
								chatId: msg.chat_id,
								observer,
								appConfig: this.config,
								agent,
							},
							signal: controller.signal,
						},
					);
				} catch (e) {
					if (
						controller.signal.aborted ||
						(e as Error)?.name === "AbortError" ||
						(e as Error)?.message?.includes("aborted")
					) {
						logger.info(
							`[AgentLoop] Execution aborted for chat ${msg.chat_id}`,
						);

						// Finalize streams if aborted mid-stream
						try {
							await this.bus.publishOutbound({
								channel: msg.channel,
								chat_id: msg.chat_id,
								content: "",
								reply_to: replyTo,
								metadata: {
									_stream_id: streamId,
									_stream_end: true,
									reply_to: replyTo,
								},
							});
						} catch {}
						try {
							await this.bus.publishOutbound({
								channel: msg.channel,
								chat_id: msg.chat_id,
								content: "",
								metadata: {
									_stream_id: `tools-${streamId}`,
									_stream_end: true,
								},
							});
						} catch {}
					} else {
						throw e;
					}
				} finally {
					this.activeExecutions.delete(msg.chat_id);
				}
			} catch (e) {
				if (this.running) {
					logger.error(e, "[AgentLoop] Error processing inbound message");
				}
			}
		}
	}

	private coalesceInbound(batch: InboundMessage[]): InboundMessage {
		if (batch.length === 1) {
			return batch[0];
		}

		const first = batch[0];
		const last = batch[batch.length - 1];
		const mergedContent = batch
			.map((message) => message.content.trim())
			.filter((content) => content.length > 0)
			.join("\n");

		return {
			channel: first.channel,
			sender_id: first.sender_id,
			chat_id: first.chat_id,
			content: mergedContent || first.content,
			timestamp: last.timestamp ?? first.timestamp,
			metadata: {
				...(first.metadata ?? {}),
				...(last.metadata ?? {}),
				_batched_inbound: true,
				_batched_count: batch.length,
			},
		};
	}
}

/**
 * Loads recent message history for a given chatId from the checkpoint store.
 */
export async function getSessionMessages(
	chatId: string,
): Promise<BaseMessage[]> {
	const checkpointer = new FileCheckpointSaver(chatId);
	await checkpointer.load();
	return checkpointer.messages;
}

/**
 * Manually forces conversation compaction using the built-in summarization middleware.
 */
export async function forceCompactMessages(
	config: AppConfig,
	messages: BaseMessage[],
): Promise<BaseMessage[] | null> {
	if (messages.length === 0) return null;

	const summarizationModel =
		config.agent.summarization_model || config.agent.model;

	const middleware = summarizationMiddleware({
		model: summarizationModel,
		trigger: { tokens: 1 }, // force trigger on any conversation
		keep: { messages: 0 },
	});

	if (middleware.beforeModel) {
		try {
			if (!isBeforeModelMiddleware(middleware.beforeModel)) return messages;
			const updates = await middleware.beforeModel(
				{ messages },
				{ context: {} },
			);
			if (updates && Array.isArray(updates.messages)) {
				return applyMessageUpdates(messages, updates.messages);
			}
		} catch (err) {
			logger.error(err, "[AgentLoop] Failed manually compacting messages");
			throw err;
		}
	}
	return messages;
}
