import { SystemMessage, ToolMessage } from "@langchain/core/messages";
import {
	Annotation,
	END,
	MessagesAnnotation,
	START,
	StateGraph,
} from "@langchain/langgraph";
import { ContextEngineeringManager } from "./history";
import { DEFAULT_SYSTEM_PROMPT } from "./loop";
import { FileCheckpointSaver } from "./store";

// Define the clean declarative Agent State using MessagesAnnotation
export const AgentState = Annotation.Root({
	...MessagesAnnotation.spec,
});

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
	} = config?.configurable || {};

	// 1. Load latest memory/context guidelines dynamically before model call
	const memoryContext = workspaceDir
		? await ContextEngineeringManager.loadMemoryFiles(workspaceDir)
		: "";
	const basePrompt = customSystemPrompt ?? DEFAULT_SYSTEM_PROMPT;
	const systemPrompt = basePrompt + (memoryContext ? `\n${memoryContext}` : "");

	const activeMessages = [
		new SystemMessage(systemPrompt),
		...state.messages.filter((m) => m.type !== "system"),
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

	// 3. Persist model output to the File Checkpoint store
	if (chatId) {
		const checkpointer = new FileCheckpointSaver(chatId);
		await checkpointer.load();
		checkpointer.messages = [...state.messages, accumulatedMessage];
		await checkpointer.save();
	}

	return {
		messages: [accumulatedMessage],
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
