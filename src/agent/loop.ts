import { type BaseMessage, HumanMessage } from "@langchain/core/messages";
import type { InboundMessage } from "@/bus/message";
import type { MessageBus } from "@/bus/queue";
import { getWorkspaceDir } from "@/config/paths";
import type { AppConfig } from "@/config/schema";
import { todayISODate } from "@/utils/date";
import { logger } from "@/utils/logger";
import { calcRetryDelay } from "@/utils/retry";
import {
	CONSOLIDATION_SYSTEM_PROMPT,
	createConsolidationAgent,
	createMainAgent,
} from "./agents";
import { forceCompactMessages } from "./compaction";
import { compiledGraph } from "./graph";
import { AgentEventObserver } from "./observer";
import { TaskScheduler } from "./scheduler";
import { StateManager } from "./state";
import { FileCheckpointSaver } from "./store";

const INBOUND_BATCH_MAX_CONTENT_LENGTH = 1200;
const INBOUND_BATCH_DEBOUNCE_MS = 250;

export const DEFAULT_SYSTEM_PROMPT = `You are Miniclaw, a persistent tool-first AI assistant. You respond with text and tool calls. The user sees your responses and tool outputs in real time.

## Core Behavior
- Be concise and direct. Don't over-explain unless asked.
- No preamble. Never say "Sure!", "Great question!", or "I'll now do X" — just do it.
- Do not "single-shot" complex tasks by guessing preferences or making arbitrary assumptions when options/decisions arise. If a requirement has multiple paths, is ambiguous, or presents design alternatives, STOP execution, lay out the choices clearly, and ask the user to choose before proceeding.
- Don't narrate tool calls. Let the output speak; explain a result only if it's ambiguous.

## Progress Updates
For longer tasks, give a brief update at reasonable intervals — one sentence on what's done and what's next.

## Memory Policy
You have access to \`recall\` and \`remember\` tools backed by a persistent long-term memory store that may contain context absent from the current conversation window.

### When to recall
Call \`recall\` before responding whenever the answer plausibly depends on prior context — user details, past decisions, preferences, ongoing work, or anything previously discussed. Responding with "I don't have that information" without first attempting recall is incorrect behavior. Skip recall only for general-knowledge questions that require no personal or session context.

### When and how to remember
Proactively save information whenever it would meaningfully change how you respond in a future conversation — facts, decisions, corrections, preferences, or ongoing context. Every write must follow this two-step sequence:

1. **Scan** — Call \`recall\` with a relevant query to check whether a related fact already exists.
2. **Write** — Based on the result:
   - Related memory found → call \`remember\` with that entry's \`key\` to overwrite/update it.
   - No related memory found → call \`remember\` without a key to insert a new fact.

Calling \`remember\` without a preceding \`recall\` is strictly prohibited.

### Ground truth assumption
Treat in-context knowledge as incomplete by default. Long-term memory is the authoritative source for anything context-dependent.`;

export class AgentLoop {
	public readonly config: AppConfig;
	public readonly bus: MessageBus;
	public running: boolean = false;
	private inboundTask?: Promise<void>;
	private activeExecutions = new Map<
		string,
		{ abortController: AbortController }
	>();
	private scheduler: TaskScheduler | null = null;
	private lastActiveAgentType = new Map<string, "main" | "consolidation">();

	constructor(config: AppConfig, bus: MessageBus) {
		this.config = config;
		this.bus = bus;
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

		// Recover pending messages on startup
		void this.recoverPendingMessages();
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

	private async recoverPendingMessages() {
		try {
			const activeRequests = await StateManager.getActiveRequests();
			for (const [chatId, msg] of Object.entries(activeRequests)) {
				logger.info(
					`[AgentLoop] Recovering pending request for chat ${chatId}...`,
				);
				await StateManager.clearActiveRequest(chatId);
				await this.bus.publishInbound({
					...msg,
					metadata: {
						...(msg.metadata || {}),
						_is_retry: true,
					},
				});
			}
		} catch (err) {
			logger.error(err, "[AgentLoop] Error recovering pending messages");
		}
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

				let succeeded = false;
				let aborted = false;

				try {
					const consolidationState = await StateManager.getConsolidationState(
						msg.chat_id,
					);

					const currentAgentType = consolidationState?.active
						? "consolidation"
						: "main";

					let lastAgentType = this.lastActiveAgentType.get(msg.chat_id);
					if (lastAgentType === undefined) {
						lastAgentType = currentAgentType;
						this.lastActiveAgentType.set(msg.chat_id, currentAgentType);
					}

					if (lastAgentType !== currentAgentType) {
						logger.info(
							`[AgentLoop] Agent switched from ${lastAgentType} to ${currentAgentType} for chat ${msg.chat_id}.`,
						);
						await this.bus.publishOutbound({
							channel: msg.channel,
							chat_id: msg.chat_id,
							content: `You are now talking with ${currentAgentType} agent.`,
							reply_to: replyTo,
						});
						this.lastActiveAgentType.set(msg.chat_id, currentAgentType);
					}

					// biome-ignore lint/suspicious/noExplicitAny: dynamically created agent types can vary
					let agent: any;
					let customSystemPrompt: string | undefined;

					const isConsolidationActive = consolidationState?.active === true;

					if (consolidationState?.active) {
						logger.info(
							`[AgentLoop] Active consolidation found for chat ${msg.chat_id}. Routing to consolidation agent.`,
						);

						if (consolidationState.checkpointMessageCount === undefined) {
							consolidationState.checkpointMessageCount =
								checkpointer.messages.length;
							await StateManager.saveConsolidationState(
								msg.chat_id,
								consolidationState,
							);
							logger.info(
								`[AgentLoop] Recorded checkpoint base length before consolidation: ${consolidationState.checkpointMessageCount}`,
							);
						}

						agent = await createConsolidationAgent(
							this.config,
							workspaceDir,
							msg.chat_id,
							this.bus,
							msg.channel,
						);
						customSystemPrompt = CONSOLIDATION_SYSTEM_PROMPT.replace(
							"{{PROPOSED_WORKFLOW}}",
							consolidationState.proposedWorkflow,
						);
					} else {
						agent = await createMainAgent(this.config, workspaceDir, this.bus);
					}

					const model = agent.options.model;
					const tools = agent.options.tools || [];

					// Append user message to history if it's not a retry
					if (!msg.metadata?._is_retry) {
						checkpointer.messages.push(
							new HumanMessage({
								content: msg.content,
								additional_kwargs: {
									message_id: msg.metadata?.message_id,
								},
							}),
						);
						await checkpointer.save();
					}

					// Save current message as active request in StateManager
					await StateManager.saveActiveRequest(msg.chat_id, msg);

					// Daily Cron: check if we should run auto-summarization/profiling
					try {
						await this.runDailyCronIfNeeded(
							msg.chat_id,
							msg.channel,
							checkpointer,
						);
					} catch (err) {
						logger.error(
							err,
							"[AgentLoop] Failed during daily cron memory update",
						);
						throw err; // Propagate to trigger retry
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
								channel: msg.channel,
								observer,
								appConfig: this.config,
								agent,
								systemPrompt: customSystemPrompt,
								bus: this.bus,
								isConsolidationActive,
							},
							signal: controller.signal,
							recursionLimit: this.config.agent.max_iterations,
						},
					);
					succeeded = true;
				} catch (e) {
					if (
						controller.signal.aborted ||
						(e as Error)?.name === "AbortError" ||
						(e as Error)?.message?.includes("aborted")
					) {
						aborted = true;
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
						// Error occurred, retry with exponential backoff on queue
						const retryCount = ((msg.metadata?._retryCount as number) || 0) + 1;
						const delay = calcRetryDelay(retryCount);
						logger.error(
							e,
							`[AgentLoop] Error processing inbound message for chat ${msg.chat_id}. Retrying (attempt ${retryCount}) in ${delay}ms...`,
						);

						const updatedMsg = {
							...msg,
							metadata: {
								...(msg.metadata || {}),
								_retryCount: retryCount,
								_is_retry: true,
							},
						};
						await StateManager.saveActiveRequest(msg.chat_id, updatedMsg);

						setTimeout(() => {
							if (this.running) {
								void this.bus.publishInbound(updatedMsg);
							}
						}, delay);
					}
				} finally {
					this.activeExecutions.delete(msg.chat_id);
					if (succeeded || aborted) {
						await StateManager.clearActiveRequest(msg.chat_id);
					}
				}
			} catch (e) {
				if (this.running) {
					logger.error(e, "[AgentLoop] Error processing inbound message");
				}
			}
		}
	}

	private async runDailyCronIfNeeded(
		chatId: string,
		channel: string,
		checkpointer: FileCheckpointSaver,
	): Promise<void> {
		try {
			const todayStr = todayISODate();
			const lastRunDate = await StateManager.getLastCronDate(chatId);

			if (lastRunDate !== todayStr) {
				logger.info(
					`[AgentLoop] Running daily cron compaction pipeline for chat ${chatId}`,
				);

				if (checkpointer.messages.length > 0) {
					await forceCompactMessages(
						this.config,
						checkpointer.messages,
						chatId,
						channel,
						this.bus,
					);
				}

				await StateManager.saveLastCronDate(chatId, todayStr);
			}
		} catch (err) {
			logger.error(
				err,
				`[AgentLoop] Failed during daily cron compaction pipeline for chat ${chatId}`,
			);
			throw err;
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
