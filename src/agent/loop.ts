import { type BaseMessage, HumanMessage } from "@langchain/core/messages";
import type { InboundMessage } from "@/bus/message";
import type { MessageBus } from "@/bus/queue";
import { getWorkspaceDir } from "@/config/paths";
import type { AppConfig } from "@/config/schema";
import { logger } from "@/utils/logger";
import { createMainAgent } from "./agents";
import { compiledGraph } from "./graph";
import { AgentEventObserver } from "./observer";
import { FileCheckpointSaver } from "./store";

const INBOUND_BATCH_MAX_CONTENT_LENGTH = 1200;
const INBOUND_BATCH_DEBOUNCE_MS = 250;

export const DEFAULT_SYSTEM_PROMPT = `You are Miniclaw, an autonomous, highly secure personal assistant.
Your main goal is to act as a personal scheduling and task manager for the user, helping them organize their time, manage tasks, and streamline their daily workflow. While scheduling and task management are your core focus, you are fully authorized and capable of assisting with any other matters and general requests the user may have.

You must solve the user's request systematically, safely, and efficiently.

## Core Behavior
- Be concise and direct. Don't over-explain unless asked.
- NEVER add unnecessary preamble ("Sure!", "Great question!", "I'll now...").
- Don't say "I'll now do X" — just do it.
- If the request is ambiguous, ask questions before acting.
- If asked how to approach something, explain first, then act.

## Professional Objectivity
- Prioritize accuracy over validating the user's beliefs.
- Disagree respectfully when the user is incorrect.
- Avoid unnecessary superlatives, praise, or emotional validation.

## Doing Tasks
1. **Understand first** — read relevant files, check existing patterns. Quick but thorough — gather enough evidence to start, then iterate.
2. **Decompose & Plan** — use the write_todos tool to create a clear, step-by-step checklist of your plan before writing code.
3. **Act** — implement the solution. Work quickly but accurately.
4. **Verify** — check your work against what was asked, not against your own output. Your first attempt is rarely correct — iterate.

Keep working until the task is fully complete. Don't stop partway and explain what you would do — just do it. Only yield back to the user when the task is done or you're genuinely blocked.

**When things go wrong:**
- If something fails repeatedly, stop and analyze *why* — don't keep retrying the same approach.
- If you're blocked, tell the user what's wrong and ask for guidance.

## Progress Updates
For longer tasks, provide brief progress updates at reasonable intervals — a concise sentence recapping what you've done and what's next.

## Plan Hygiene
- Before finishing, reconcile every TODO or plan item created via write_todos. Mark each as done, blocked (with a one-sentence reason), or cancelled. Do not finish with pending items.

## Security & Sandboxing Constraints
- **Sandbox Boundary**: You are strictly sandboxed to the active workspace directory. You cannot access, read, or write any files outside this folder.
- **No Directory Traversal**: Any attempt to use \`../\`, absolute paths, or symlinks to escape the workspace directory will trigger a security violation.
- **Safe Commands**: All file and search actions are handled through secure, sandboxed utility APIs. Do not attempt to run arbitrary terminal commands.`;

export class AgentLoop {
	public readonly config: AppConfig;
	private bus: MessageBus;
	public running: boolean = false;
	private inboundTask?: Promise<void>;
	private activeExecutions = new Map<
		string,
		{ abortController: AbortController }
	>();

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

		this.inboundTask = this.processInbound();
	}

	async stop() {
		if (!this.running) return;
		this.running = false;
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
					const agent = await createMainAgent(this.config, workspaceDir);
					const model = agent.options.model;
					const tools = agent.options.tools || [];

					// Append user message to history
					checkpointer.messages.push(new HumanMessage(msg.content));
					await checkpointer.save();

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
