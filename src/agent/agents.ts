import { createAgent, summarizationMiddleware } from "langchain";
import type { AppConfig } from "@/config/schema";
import { createChatModel } from "./models";
import { createExecuteTool } from "./tools/execute";
import { createFilesystemTools } from "./tools/filesystem";
import { createRecallTool, createRememberTool } from "./tools/memory";
import { createSearchSkillsTool } from "./tools/skills";
import { createWriteTodosTool } from "./tools/todos";

/**
 * Creates and configures the main scheduler/task execution agent using LangChain's createAgent.
 *
 * @param config The application configuration
 * @param workspaceDir The absolute path to the active workspace directory
 * @returns A promise resolving to the compiled ReactAgent instance
 */
export async function createMainAgent(config: AppConfig, workspaceDir: string) {
	const model = await createChatModel(config);
	const fsTools = createFilesystemTools(workspaceDir);
	const todoTool = createWriteTodosTool(workspaceDir);
	const executeTool = createExecuteTool(workspaceDir);
	const rememberTool = createRememberTool(config);
	const recallTool = createRecallTool(config);
	const searchSkillsTool = createSearchSkillsTool(config, workspaceDir);

	// Base tools list
	const baseTools = [
		...fsTools,
		todoTool,
		executeTool,
		rememberTool,
		recallTool,
		searchSkillsTool,
	];

	const summarizationModel =
		config.agent.summarization_model || config.agent.model;

	return createAgent({
		model,
		tools: baseTools,
		middleware: [
			summarizationMiddleware({
				model: summarizationModel,
				trigger: { tokens: config.agent.compaction_trigger_tokens },
				keep: { messages: 20 },
			}),
		],
	});
}
