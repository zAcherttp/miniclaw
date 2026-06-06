import fs from "node:fs/promises";
import path from "node:path";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { createAgent, summarizationMiddleware } from "langchain";
import { z } from "zod";
import type { MessageBus } from "@/bus/queue";
import type { AppConfig } from "@/config/schema";
import { logger } from "@/utils/logger";
import { createChatModel } from "./models";
import { SkillFrontmatterSchema, SkillsManager } from "./skills";
import { StateManager } from "./state";
import { createExecuteTool } from "./tools/execute";
import { createFilesystemTools } from "./tools/filesystem";
import { createRecallTool, createRememberTool } from "./tools/memory";
import { createManageRemindersTool } from "./tools/reminders";
import { createSearchSkillsTool } from "./tools/skills";
import { createWriteTodosTool } from "./tools/todos";

/**
 * Creates and configures the main scheduler/task execution agent using LangChain's createAgent.
 *
 * @param config The application configuration
 * @param workspaceDir The absolute path to the active workspace directory
 * @param bus The message bus queue
 * @returns A promise resolving to the compiled ReactAgent instance
 */
export async function createMainAgent(
	config: AppConfig,
	workspaceDir: string,
	bus: MessageBus,
) {
	const model = await createChatModel(config);
	const fsTools = createFilesystemTools(workspaceDir);
	const todoTool = createWriteTodosTool(workspaceDir);
	const executeTool = createExecuteTool(workspaceDir);
	const rememberTool = createRememberTool(config);
	const recallTool = createRecallTool(config);
	const searchSkillsTool = createSearchSkillsTool(config, workspaceDir);
	const manageRemindersTool = createManageRemindersTool(workspaceDir, bus);

	// Base tools list
	const baseTools = [
		...fsTools,
		todoTool,
		executeTool,
		rememberTool,
		recallTool,
		searchSkillsTool,
		manageRemindersTool,
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

export const CONSOLIDATION_SYSTEM_PROMPT = `You are the Consolidation Agent for Miniclaw.
Your sole responsibility is to help the user review, edit, and confirm the saving of a proposed workflow skill.

Here is the proposed workflow skill:
\`\`\`markdown
{{PROPOSED_WORKFLOW}}
\`\`\`

Rules:
1. Explain to the user that this workflow was detected from their recent chat history and ask if they want to save it.
2. If the user wants to make modifications, edit the markdown content accordingly.
3. If they confirm they want to save it, call the \`save_workflow\` tool with the finalized markdown content, and then call the \`conclude_consolidation\` tool with action "save" to return control to the main agent.
4. If they want to discard/reject it, call the \`conclude_consolidation\` tool with action "discard" to clean up and return to the main agent.
5. Be polite, direct, and concise. Don't perform any other operations (like executing commands or reading files) since your only purpose is workflow consolidation.`;

export async function createConsolidationAgent(
	config: AppConfig,
	workspaceDir: string,
	chatId: string,
	bus: MessageBus,
	channel: string,
) {
	const model = await createChatModel(config);

	const saveWorkflowTool = new DynamicStructuredTool({
		name: "save_workflow",
		description:
			"Saves the finalized workflow skill markdown text to the workspace.",
		schema: z.object({
			workflow_content: z
				.string()
				.describe("The full markdown content of the skill to save"),
		}),
		func: async ({ workflow_content }) => {
			try {
				const { metadata } = SkillsManager.parseFrontmatterAs(
					workflow_content,
					SkillFrontmatterSchema,
				);
				if (!metadata?.name) {
					return "Error: Could not find skill name in frontmatter.";
				}
				let skillName = metadata.name.trim();
				let finalContent = workflow_content;
				if (!skillName.startsWith("workflow-")) {
					const oldName = skillName;
					skillName = `workflow-${skillName}`;
					finalContent = workflow_content.replace(
						/^(name:\s*['"]?)([^'"\r\n]+)(['"]?\s*)$/m,
						(match, prefix, nameVal, suffix) => {
							if (nameVal.trim() === oldName) {
								return `${prefix}workflow-${nameVal}${suffix}`;
							}
							return match;
						},
					);
				}
				const workflowsDir = path.resolve(workspaceDir, "workflows");
				const targetSkillDir = path.join(workflowsDir, skillName);
				const skillMdPath = path.join(targetSkillDir, "SKILL.md");

				await fs.mkdir(targetSkillDir, { recursive: true });
				await fs.writeFile(skillMdPath, finalContent, "utf-8");
				return `Workflow "${skillName}" saved successfully.`;
			} catch (err) {
				return `Error saving workflow: ${(err as Error).message}`;
			}
		},
	});

	const concludeConsolidationTool = new DynamicStructuredTool({
		name: "conclude_consolidation",
		description:
			"Concludes the consolidation flow and restores the main agent.",
		schema: z.object({
			action: z
				.enum(["save", "discard"])
				.describe("Whether the workflow was saved or discarded"),
		}),
		func: async ({ action }) => {
			try {
				const condState = await StateManager.getConsolidationState(chatId);
				const targetCount = condState?.checkpointMessageCount;

				if (typeof targetCount === "number" && targetCount >= 0) {
					const { FileCheckpointSaver } = await import("@/agent/store");
					const checkpointer = new FileCheckpointSaver(chatId);
					await checkpointer.load();
					if (targetCount < checkpointer.messages.length) {
						checkpointer.messages = checkpointer.messages.slice(0, targetCount);
						await checkpointer.save();
						logger.info(
							`[Consolidation] Wiped consolidation messages from checkpoint for chat ${chatId}. Restored base count: ${targetCount}`,
						);
					}
				}

				await StateManager.clearConsolidationState(chatId);

				const replyText =
					action === "save"
						? "Workflow saved successfully. Control returned to main agent."
						: "Workflow discarded. Control returned to main agent.";
				await bus.publishOutbound({
					channel,
					chat_id: chatId,
					content: replyText,
				});

				// Re-publish the original pending user request back to the inbound queue
				if (condState?.pendingRequest) {
					await bus.publishInbound(condState.pendingRequest);
					logger.info(
						`[Consolidation] Re-published pending user request: "${condState.pendingRequest.content}"`,
					);
				}

				return `Consolidation concluded with action "${action}". Control returned to main agent.`;
			} catch (err) {
				return `Error concluding consolidation: ${(err as Error).message}`;
			}
		},
	});

	return createAgent({
		model,
		tools: [saveWorkflowTool, concludeConsolidationTool],
	});
}
