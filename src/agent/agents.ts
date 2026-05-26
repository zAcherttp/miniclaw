import { createAgent } from "langchain";
import type { AppConfig } from "@/config/schema";
import { createChatModel } from "./models";
import { createExecuteTool } from "./tools/execute";
import { createFilesystemTools } from "./tools/filesystem";
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

	// Base tools list
	const baseTools = [...fsTools, todoTool, executeTool];

	return createAgent({
		model,
		tools: baseTools,
	});
}
