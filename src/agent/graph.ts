import {
	type BaseMessage,
	SystemMessage,
	ToolMessage,
} from "@langchain/core/messages";
import {
	Annotation,
	END,
	MessagesAnnotation,
	START,
	StateGraph,
} from "@langchain/langgraph";
import type { AppConfig } from "@/config/schema";
import { logger } from "@/utils/logger";
import { compactAndExtractWorkflows } from "./compaction";
import { ContextEngineeringManager } from "./history";
import { DEFAULT_SYSTEM_PROMPT } from "./loop";
import { MemoryManager } from "./memory";
import { applyMessageUpdates, isBeforeModelMiddleware } from "./middleware";
import type { AgentEventObserver } from "./observer";
import { SkillsManager } from "./skills";
import { FileCheckpointSaver } from "./store";
import { getSystemInfoBlock } from "./systemInfo";
import { estimateMessagesTokens, formatTokens } from "./tokenizer";

interface ToolBoundRunnable {
	// biome-ignore lint/suspicious/noExplicitAny: stream yields message chunks asynchronously
	stream(input: unknown, config?: unknown): Promise<AsyncIterable<any>>;
	invoke(input: unknown, config?: unknown): Promise<unknown>;
}

interface ToolBindingModel {
	bindTools(tools: unknown[]): ToolBoundRunnable;
}

interface GenericTool {
	name: string;
	invoke(args: unknown, config?: unknown): Promise<string>;
}

interface GraphNodeConfig {
	configurable?: {
		workspaceDir?: string;
		agentModel?: unknown;
		agentTools?: unknown[];
		chatId?: string;
		observer?: AgentEventObserver;
		systemPrompt?: string;
		appConfig?: AppConfig;
		agent?: {
			options?: {
				middleware?: Array<{
					name: string;
					beforeModel?: unknown;
				}>;
			};
		};
	};
}

function isToolBindingModel(model: unknown): model is ToolBindingModel {
	return (
		typeof model === "object" &&
		model !== null &&
		"bindTools" in model &&
		typeof (model as { bindTools?: unknown }).bindTools === "function"
	);
}

// Define the clean declarative Agent State using MessagesAnnotation
export const AgentState = Annotation.Root({
	...MessagesAnnotation.spec,
});

/**
 * Simple helper to apply middleware message updates (resolving RemoveMessage and new ones).
 */

/**
 * Agent Node: Resolves dynamic context prompts, streams tokens and reasoning via
 * the Event Observer, and persists the accumulated AIMessage response.
 */
async function agentNode(
	state: typeof AgentState.State,
	config?: GraphNodeConfig,
) {
	const {
		workspaceDir,
		agentModel: model,
		agentTools: tools,
		chatId,
		observer,
		systemPrompt: customSystemPrompt,
		appConfig,
		agent,
	} = config?.configurable || {};

	let systemPrompt = observer?.cachedSystemPrompt || "";

	if (!systemPrompt) {
		// 1. Load latest memory/context guidelines dynamically before model call
		const memoryContext = workspaceDir
			? await ContextEngineeringManager.loadMemoryFiles(workspaceDir)
			: "";

		// 2. Fetch and inject User Profile & Goals memory dynamically
		let memoryPrompt = "";
		if (appConfig) {
			try {
				const memoryManager = MemoryManager.getInstance(appConfig);
				memoryPrompt = await memoryManager.generatePromptBlock();
			} catch (err) {
				logger.error(err, "[AgentNode] Failed to fetch User Profile memory");
			}
		}

		const skillsDirs = appConfig?.agent?.skills_dirs ?? ["skills"];
		let skillsPrompt = "";
		if (workspaceDir) {
			try {
				const loadedSkills = await SkillsManager.loadSkills(
					workspaceDir,
					skillsDirs,
				);
				const loadedWorkflows = await SkillsManager.loadSkills(workspaceDir, [
					"workflows",
				]);
				skillsPrompt = await SkillsManager.generatePromptBlock([
					...loadedSkills,
					...loadedWorkflows,
				]);
			} catch (err) {
				logger.error(err, "[AgentNode] Failed to load dynamic agent skills");
			}
		}

		const systemInfoBlock = workspaceDir
			? getSystemInfoBlock(workspaceDir)
			: "";

		const basePrompt = customSystemPrompt ?? DEFAULT_SYSTEM_PROMPT;
		const promptParts = [
			basePrompt,
			systemInfoBlock,
			memoryContext,
			skillsPrompt,
			memoryPrompt,
		].filter(Boolean);
		systemPrompt = `${promptParts.map((p) => p.trim()).join("\n\n")}\n`;

		if (observer) {
			observer.cachedSystemPrompt = systemPrompt;
		}
	}

	// 3. Process built-in middleware (e.g. short-term summarization compaction)
	let middlewareUpdates: BaseMessage[] | null = null;
	let messages = [...state.messages];

	const triggerTokens = appConfig?.agent?.compaction_trigger_tokens ?? 220000;

	if (agent?.options && Array.isArray(agent.options.middleware)) {
		for (const m of agent.options.middleware) {
			if (isBeforeModelMiddleware(m.beforeModel)) {
				try {
					const tokensBefore = estimateMessagesTokens(messages);
					const updates = await m.beforeModel({ messages }, { context: {} });
					if (
						updates &&
						Array.isArray(updates.messages) &&
						updates.messages.length > 0
					) {
						middlewareUpdates = updates.messages;
						messages = applyMessageUpdates(messages, updates.messages);
						const tokensAfter = estimateMessagesTokens(messages);

						// Save compacted messages to the file checkpointer immediately
						if (chatId) {
							const checkpointer = new FileCheckpointSaver(chatId);
							checkpointer.messages = messages;
							await checkpointer.save();
						}

						// Trigger background workflow extraction asynchronously
						if (appConfig && workspaceDir) {
							void compactAndExtractWorkflows(
								appConfig,
								state.messages,
								workspaceDir,
							)
								.then(({ newWorkflowName }) => {
									if (newWorkflowName) {
										logger.info(
											`[AgentNode] Background compaction discovered and created new workflow: ${newWorkflowName}`,
										);
									}
								})
								.catch((err) => {
									logger.error(
										err,
										"[AgentNode] Error in background workflow extraction",
									);
								});
						}

						// Notify the user via the message bus
						if (observer) {
							await observer.publishNotification(
								`conversation auto compacted: ${formatTokens(tokensBefore)} tokens to ${formatTokens(tokensAfter)} tokens / ${formatTokens(triggerTokens)}`,
							);
						}
					}
				} catch (err) {
					logger.error(err, `[AgentNode] Failed to run middleware ${m.name}`);
				}
			}
		}
	}

	const activeMessages = [
		new SystemMessage(systemPrompt),
		...messages.filter((m) => m.type !== "system"),
	];

	if (!isToolBindingModel(model)) {
		throw new Error(
			"AgentNode: The configured model does not support tool binding.",
		);
	}
	const modelWithTools = model.bindTools(tools || []);

	let accumulatedMessage: BaseMessage | null = null;
	try {
		const stream = await modelWithTools.stream(activeMessages, config);
		if (observer) {
			accumulatedMessage = (await observer.consume(
				stream,
			)) as BaseMessage | null;
		} else {
			// Fallback: Accumulate stream directly if no observer is attached
			for await (const chunk of stream) {
				if (accumulatedMessage === null) {
					accumulatedMessage = chunk as BaseMessage;
				} else if (
					typeof accumulatedMessage === "object" &&
					accumulatedMessage !== null &&
					"concat" in accumulatedMessage &&
					typeof (accumulatedMessage as { concat?: unknown }).concat ===
						"function"
				) {
					accumulatedMessage = (
						accumulatedMessage as { concat(other: unknown): BaseMessage }
					).concat(chunk);
				} else {
					accumulatedMessage = chunk as BaseMessage;
				}
			}
		}
	} catch (_e) {
		// Fallback to invoke if streaming fails
		accumulatedMessage = (await modelWithTools.invoke(
			activeMessages,
			config,
		)) as BaseMessage;
	}

	if (!accumulatedMessage) {
		throw new Error("AgentNode: Generated model response is empty.");
	}

	// 4. Persist model output to the File Checkpoint store
	if (chatId) {
		const checkpointer = new FileCheckpointSaver(chatId);
		await checkpointer.load();
		checkpointer.messages = [...messages, accumulatedMessage];
		await checkpointer.save();
	}

	return {
		messages: middlewareUpdates
			? [...middlewareUpdates, accumulatedMessage]
			: [accumulatedMessage],
	};
}

/**
 * Tools Node: Sequentially executes sandboxed tool calls, publishes execution
 * progress to the Observer, and persists resulting ToolMessages.
 */
async function toolsNode(
	state: typeof AgentState.State,
	config?: GraphNodeConfig,
) {
	const { agentTools: tools, chatId, observer } = config?.configurable || {};

	const validTools: GenericTool[] = [];
	if (Array.isArray(tools)) {
		for (const t of tools) {
			if (
				typeof t === "object" &&
				t !== null &&
				"name" in t &&
				typeof (t as { name?: unknown }).name === "string" &&
				"invoke" in t &&
				typeof (t as { invoke?: unknown }).invoke === "function"
			) {
				validTools.push(t as GenericTool);
			} else {
				logger.warn(
					`[ToolsNode] Discarding invalid tool: ${JSON.stringify(t)}`,
				);
			}
		}
	} else {
		logger.error(
			`[ToolsNode] tools parameter is not a valid array: ${typeof tools}`,
		);
	}

	const toolsByName = new Map<string, GenericTool>(
		validTools.map((t) => [t.name, t]),
	);

	const lastMessage = state.messages[state.messages.length - 1];
	if (
		!lastMessage ||
		!("tool_calls" in lastMessage) ||
		!Array.isArray(lastMessage.tool_calls) ||
		lastMessage.tool_calls.length === 0
	) {
		return {};
	}

	const toolCalls = lastMessage.tool_calls;
	const toolMessages: ToolMessage[] = [];

	// 1. Notify the Observer that tool call execution is beginning
	if (observer) {
		await observer.publishToolStart(
			toolCalls.map((tc) => ({ name: tc.name, args: tc.args || {} })),
		);
	}

	// 2. Execute tool calls sequentially
	for (const tc of toolCalls) {
		const tool = toolsByName.get(tc.name);
		let result: string;

		if (!tool) {
			result = `Error: Tool ${tc.name} is not available.`;
		} else {
			try {
				result = await tool.invoke(tc.args, config);
			} catch (err) {
				const errMsg = err instanceof Error ? err.message : String(err);
				result = `Error executing tool ${tc.name}: ${errMsg}`;
			}
		}

		toolMessages.push(
			new ToolMessage({
				content: result,
				tool_call_id: tc.id ?? "",
				name: tc.name,
			}),
		);
	}

	// 3. Notify the Observer that tools finished execution
	if (observer) {
		await observer.publishToolEnd();
	}

	// 4. Persist tool messages to the File Checkpoint store
	if (chatId) {
		const checkpointer = new FileCheckpointSaver(chatId);
		await checkpointer.load();
		checkpointer.messages = [...state.messages, ...toolMessages];
		await checkpointer.save();
	}

	return {
		messages: toolMessages,
	};
}

/**
 * Conditional edge router: Checks if tool calls are present in the last message
 * to decide whether to route to the tools node or complete execution.
 */
function shouldContinue(state: typeof AgentState.State) {
	const lastMessage = state.messages[state.messages.length - 1];
	if (
		lastMessage &&
		"tool_calls" in lastMessage &&
		Array.isArray(lastMessage.tool_calls) &&
		lastMessage.tool_calls.length > 0
	) {
		return "tools";
	}
	return END;
}

// Compile the clean declarative ReAct graph
const workflow = new StateGraph(AgentState)
	.addNode("agent", agentNode)
	.addNode("tools", toolsNode)
	.addEdge(START, "agent")
	.addConditionalEdges("agent", shouldContinue)
	.addEdge("tools", "agent");

export const compiledGraph = workflow.compile();
