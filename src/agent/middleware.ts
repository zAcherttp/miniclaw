import type { BaseMessage } from "@langchain/core/messages";
import { REMOVE_ALL_MESSAGES } from "@langchain/langgraph";

export type BeforeModelMiddleware = (
	input: { messages: BaseMessage[] },
	options: { context: Record<string, unknown> },
) => Promise<{ messages?: BaseMessage[] } | undefined>;

export function isBeforeModelMiddleware(
	middleware: unknown,
): middleware is BeforeModelMiddleware {
	return typeof middleware === "function";
}

export function getRemoveMessageId(message: BaseMessage): string | null {
	if (message.type !== "remove") return null;
	const id = (message as { id?: unknown }).id;
	return typeof id === "string" ? id : null;
}

export function applyMessageUpdates(
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
