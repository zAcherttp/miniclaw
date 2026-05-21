import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
	type BaseMessage,
	HumanMessage,
	SystemMessage,
	ToolMessage,
} from "@langchain/core/messages";
import type { StructuredTool } from "@langchain/core/tools";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Creates the delegate_task tool for the main agent.
 */
export function createDelegateTaskTool(
	model: BaseChatModel,
	baseTools: StructuredTool[],
	_workspaceDir: string,
) {
	return new DynamicStructuredTool({
		name: "delegate_task",
		description:
			"Launches an ephemeral, autonomous subagent to handle a specific, independent subtask (e.g. performing deep research or editing a specific file). The subagent executes with isolated context and returns its final report. Note: Subagents are guarded and cannot spawn their own sub-subagents.",
		schema: z.object({
			taskDescription: z
				.string()
				.describe(
					"A highly detailed task description for the subagent to perform autonomously.",
				),
		}),
		func: async ({ taskDescription }) => {
			try {
				// Filter out delegate_task tool to prevent recursion
				const subagentTools = baseTools.filter(
					(t) => t.name !== "delegate_task",
				);

				// System prompt for the subagent
				const subagentPrompt = `In order to complete the objective that the user asks of you, you have access to a number of standard tools.
You are a subagent executing the following independent task: "${taskDescription}".
Focus entirely on performing this task. When you are finished, return a concise summary of the results you achieved.`;

				const messages: BaseMessage[] = [
					new SystemMessage(subagentPrompt),
					new HumanMessage(taskDescription),
				];

				// biome-ignore lint/suspicious/noExplicitAny: BaseChatModel type doesn't expose bindTools, but all concrete providers implement it at runtime
				const modelWithTools = (model as any).bindTools(subagentTools);

				// ephemerally execute up to 5 steps
				for (let i = 0; i < 5; i++) {
					const response = await modelWithTools.invoke(messages);
					messages.push(response);

					if (
						!response.tool_calls ||
						!Array.isArray(response.tool_calls) ||
						response.tool_calls.length === 0
					) {
						return response.content;
					}

					// Execute tools sequentially
					for (const tc of response.tool_calls) {
						const tool = subagentTools.find((t) => t.name === tc.name);
						if (!tool) {
							messages.push(
								new ToolMessage({
									name: tc.name,
									content: `Tool ${tc.name} not found.`,
									tool_call_id: tc.id ?? "",
								}),
							);
							continue;
						}

						const result = await tool.invoke(tc.args);
						messages.push(
							new ToolMessage({
								name: tc.name,
								content:
									typeof result === "string" ? result : JSON.stringify(result),
								tool_call_id: tc.id ?? "",
							}),
						);
					}
				}

				const finalResp = await model.invoke(messages);
				return finalResp.content;
			} catch (err: unknown) {
				return `Error executing subagent task: ${(err as Error).message}`;
			}
		},
	});
}
