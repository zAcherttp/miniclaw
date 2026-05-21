import type { BaseMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";

export const AgentState = Annotation.Root({
	messages: Annotation<BaseMessage[]>({
		reducer: (x, y) => x.concat(y),
		default: () => [],
	}),
	workspaceDir: Annotation<string>({
		reducer: (x, y) => y ?? x,
		default: () => "",
	}),
	chatId: Annotation<string>({
		reducer: (x, y) => y ?? x,
		default: () => "",
	}),
});

export type AgentStateType = typeof AgentState.State;
