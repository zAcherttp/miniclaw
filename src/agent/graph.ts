import {
	type BaseMessage,
	SystemMessage,
	ToolMessage,
} from "@langchain/core/messages";
import {
	Annotation,
	END,
	MessagesAnnotation,
	REMOVE_ALL_MESSAGES,
	START,
	StateGraph,
} from "@langchain/langgraph";
import { logger } from "@/utils/logger";
import { ContextEngineeringManager } from "./history";
import { DEFAULT_SYSTEM_PROMPT } from "./loop";
import { MemoryManager } from "./memory";
import { SkillsManager } from "./skills";
import { FileCheckpointSaver } from "./store";
import { estimateMessagesTokens, formatTokens } from "./tokenizer";

// Define the clean declarative Agent State using MessagesAnnotation
export const AgentState = Annotation.Root({
	...MessagesAnnotation.spec,
});

/**
 * Simple helper to apply middleware message updates (resolving RemoveMessage and new ones).
 */
type BeforeModelMiddleware = (
	input: { messages: BaseMessage[] },
	options: { context: Record<string, unknown> },
) => Promise<{ messages?: BaseMessage[] } | undefined>;

function isBeforeModelMiddleware(
	middleware: unknown,
): middleware is BeforeModelMiddleware {
	return typeof middleware === "function";
}

function getRemoveMessageId(message: BaseMessage): string | null {
	if (message.type !== "remove") return null;
	const id = (message as { id?: unknown }).id;
	return typeof id === "string" ? id : null;
}

function applyMessageUpdates(
	current: BaseMessage[],
	updates: BaseMessage[],
): BaseMessage[] {
	let result = [...current];
	for (const msg of updates) {
		if (msg.type === "remove") {
			const removeId = getRemoveMessageId(msg);
			if (removeId) {
				if (removeId === REMOVE_ALL_MESSAGES) {
					result = [];
				} else {
					result = result.filter((m) => m.id !== removeId);
				}
			}
		} else {
			result.push(msg);
		}
	}
	return result;
}

/**
 * Agent Node: Resolves dynamic context prompts, streams tokens and reasoning via
 * the Event Observer, and persists the accumulated AIMessage response.
 */
// biome-ignore lint/suspicious/noExplicitAny: config is an untyped LangGraph configuration object
async function agentNode(state: typeof AgentState.State, config?: any) {
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

	// 1. Load latest memory/context guidelines dynamically before model call
	const memoryContext = workspaceDir
		? await ContextEngineeringManager.loadMemoryFiles(workspaceDir)
		: "";

	// 2. Fetch and inject User Profile & Goals memory dynamically
	let memoryPrompt = "";
	if (appConfig) {
		try {
			const memoryManager = MemoryManager.getInstance(appConfig);
			const profile = await memoryManager.getProfile();
			const profileDetails: string[] = [];

			if (profile.username)
				profileDetails.push(`Username: ${profile.username}`);
			if (profile.timezone)
				profileDetails.push(`User Timezone: ${profile.timezone}`);
			if (profile.traits && profile.traits.length > 0) {
				profileDetails.push(
					`User Traits & Preferences:\n${profile.traits.map((t) => `- ${t}`).join("\n")}`,
				);
			}
			if (profile.activeGoals && profile.activeGoals.length > 0) {
				profileDetails.push(
					`User Active Goals:\n${profile.activeGoals.map((g) => `- ${g}`).join("\n")}`,
				);
			}

			if (profileDetails.length > 0) {
				memoryPrompt = `\n\n## USER MEMORY (Long-Term Memory State):\n${profileDetails.join("\n\n")}`;
			}
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
			skillsPrompt = await SkillsManager.generatePromptBlock(loadedSkills);
		} catch (err) {
			logger.error(err, "[AgentNode] Failed to load dynamic agent skills");
		}
	}

	const basePrompt = customSystemPrompt ?? DEFAULT_SYSTEM_PROMPT;
	const systemPrompt =
		basePrompt +
		(memoryContext ? `\n${memoryContext}` : "") +
		(skillsPrompt ? `\n${skillsPrompt}` : "") +
		(memoryPrompt ? `\n${memoryPrompt}` : "");

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

	// biome-ignore lint/suspicious/noExplicitAny: bindTools exists at runtime on standard chat models
	const modelWithTools = (model as any).bindTools(tools);

	// biome-ignore lint/suspicious/noExplicitAny: accumulatedMessage is a dynamic AIMessageChunk/AIMessage
	let accumulatedMessage: any = null;
	try {
		const stream = await modelWithTools.stream(activeMessages, config);
		if (observer) {
			accumulatedMessage = await observer.consume(stream);
		} else {
			// Fallback: Accumulate stream directly if no observer is attached
			for await (const chunk of stream) {
				if (accumulatedMessage === null) {
					accumulatedMessage = chunk;
				} else {
					accumulatedMessage = accumulatedMessage.concat(chunk);
				}
			}
		}
	} catch (_e) {
		// Fallback to invoke if streaming fails
		accumulatedMessage = await modelWithTools.invoke(activeMessages, config);
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
// biome-ignore lint/suspicious/noExplicitAny: config is an untyped LangGraph configuration object
async function toolsNode(state: typeof AgentState.State, config?: any) {
	const { agentTools: tools, chatId, observer } = config?.configurable || {};
	// biome-ignore lint/suspicious/noExplicitAny: tools map can vary by dynamic tool schema
	const toolsByName = new Map<string, any>(tools.map((t: any) => [t.name, t]));

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
		await observer.publishToolStart(toolCalls.map((tc) => tc.name));
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
				// biome-ignore lint/suspicious/noExplicitAny: err can be of any type when caught from dynamic tool invoke
			} catch (err: any) {
				result = `Error executing tool ${tc.name}: ${err.message || err}`;
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
