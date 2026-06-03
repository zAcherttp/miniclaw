import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
	type BaseMessage,
	HumanMessage,
	SystemMessage,
} from "@langchain/core/messages";
import { summarizationMiddleware } from "langchain";
import type { AppConfig } from "@/config/schema";
import { logger } from "@/utils/logger";
import { applyMessageUpdates, isBeforeModelMiddleware } from "./middleware";
import { createChatModel } from "./models";
import { SkillFrontmatterSchema, SkillsManager } from "./skills";

function formatMessagesForLLM(messages: BaseMessage[]): string {
	return messages
		.map((msg) => {
			const type = msg.type;
			const name = msg.name ? ` (${msg.name})` : "";
			const content =
				typeof msg.content === "string"
					? msg.content
					: JSON.stringify(msg.content);

			let toolCalls = "";
			if (
				"tool_calls" in msg &&
				Array.isArray(msg.tool_calls) &&
				msg.tool_calls.length > 0
			) {
				toolCalls = `\nTool Calls: ${JSON.stringify(msg.tool_calls)}`;
			}

			return `${type}${name}: ${content}${toolCalls}`;
		})
		.join("\n\n");
}

/**
 * Manually forces conversation compaction using the built-in summarization middleware
 * and extracts any repeated command sequences into new workflow skills.
 */
export async function compactAndExtractWorkflows(
	config: AppConfig,
	messages: BaseMessage[],
	workspaceDir: string,
): Promise<{
	compactedMessages: BaseMessage[];
	newWorkflowName: string | null;
}> {
	if (messages.length === 0) {
		return { compactedMessages: messages, newWorkflowName: null };
	}

	logger.info(
		"[CompactionManager] Starting conversation compaction and workflow extraction...",
	);

	// 1. Run standard summarization compaction
	let compactedMessages = messages;
	const summarizationModel =
		config.agent.summarization_model || config.agent.model;

	const middleware = summarizationMiddleware({
		model: summarizationModel,
		trigger: { tokens: 1 }, // force trigger
		keep: { messages: 0 },
	});

	if (
		middleware.beforeModel &&
		isBeforeModelMiddleware(middleware.beforeModel)
	) {
		try {
			const updates = await middleware.beforeModel(
				{ messages },
				{ context: {} },
			);
			if (updates && Array.isArray(updates.messages)) {
				compactedMessages = applyMessageUpdates(messages, updates.messages);
				logger.info(
					"[CompactionManager] Standard summarization compaction completed.",
				);
			}
		} catch (err) {
			logger.error(
				err,
				"[CompactionManager] Failed standard summarization compaction",
			);
		}
	}

	// 2. Perform workflow extraction (skill_creator)
	let newWorkflowName: string | null = null;
	try {
		const model = await createChatModel(config);
		const formattedHistory = formatMessagesForLLM(messages);

		const systemPrompt = `You are the Skill Creator assistant for Miniclaw.
Your task is to analyze the following conversation history between a User and an AI Assistant.
Look for repeated, successful command execution patterns or workflows where the assistant executed shell commands (specifically using the \`gws\` or \`lark-cli\` binaries for calendar, mail, contact, or task scopes) to achieve a goal.

If you identify a reusable workflow pattern (consisting of a sequence of commands/actions or a recipe):
Generate a new modular skill in the following Markdown format. The description should be a single sentence. The openclaw category MUST be "workflow". Ensure you list the required binaries in the frontmatter.
The skill name must contain only lowercase letters, numbers, and hyphens (e.g. lark-freebusy, google-freebusy).

---
name: <dash-separated-lowercase-name>
description: <one-sentence-description>
metadata:
  version: 1.0.0
  openclaw:
    category: workflow
    requires:
      bins:
        - gws
        - lark-cli
---
# <Title of the Workflow>

Provide a step-by-step recipe explaining when and how the assistant should execute this workflow. Show the exact gws or lark-cli commands, parameter descriptions, rules, and example inputs/outputs.

If no new, significant, or reusable workflow pattern is found in the history, respond with exactly: NO_NEW_WORKFLOW`;

		const response = await model.invoke([
			new SystemMessage(systemPrompt),
			new HumanMessage(
				`Analyze this conversation history and extract any workflow:\n\n${formattedHistory}`,
			),
		]);

		const content =
			typeof response.content === "string" ? response.content.trim() : "";

		if (content && content !== "NO_NEW_WORKFLOW" && content.includes("---")) {
			const { metadata } = SkillsManager.parseFrontmatterAs(
				content,
				SkillFrontmatterSchema,
			);
			if (metadata?.name) {
				const skillName = metadata.name.trim();
				const workflowsDir = path.resolve(workspaceDir, "workflows");
				const targetSkillDir = path.join(workflowsDir, skillName);
				const skillMdPath = path.join(targetSkillDir, "SKILL.md");

				if (!existsSync(targetSkillDir)) {
					await fs.mkdir(targetSkillDir, { recursive: true });
					await fs.writeFile(skillMdPath, content, "utf-8");
					newWorkflowName = skillName;
					logger.info(
						`[CompactionManager] Discovered and created new workflow skill: ${skillName} at ${skillMdPath}`,
					);
				} else {
					logger.info(
						`[CompactionManager] Discovered workflow skill: ${skillName} already exists. Skipping creation.`,
					);
				}
			}
		} else {
			logger.info(
				"[CompactionManager] No new reusable workflow patterns discovered in history.",
			);
		}
	} catch (err) {
		logger.error(err, "[CompactionManager] Error during workflow extraction");
	}

	return { compactedMessages, newWorkflowName };
}
