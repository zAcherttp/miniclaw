import { existsSync } from "node:fs";
import path from "node:path";
import {
	type BaseMessage,
	HumanMessage,
	SystemMessage,
} from "@langchain/core/messages";
import { summarizationMiddleware } from "langchain";
import type { MessageBus } from "@/bus/queue";
import { getWorkspaceDir } from "@/config/paths";
import type { AppConfig } from "@/config/schema";
import { logger } from "@/utils/logger";
import { MemoryManager, type UserProfile } from "./memory";
import { applyMessageUpdates, isBeforeModelMiddleware } from "./middleware";
import { createChatModel } from "./models";
import { SkillFrontmatterSchema, SkillsManager } from "./skills";
import { StateManager } from "./state";
import { estimateMessagesTokens, formatTokens } from "./tokenizer";

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
	chatId: string,
	_channel: string,
	_bus: MessageBus,
): Promise<{
	compactedMessages: BaseMessage[];
	newWorkflowName: string | null;
}> {
	if (messages.length === 0) {
		return { compactedMessages: messages, newWorkflowName: null };
	}

	logger.info(
		"[CompactionManager] Starting conversation compaction and combined workflow extraction...",
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

	// 2. Perform combined profiling and workflow extraction (skill_creator)
	let newWorkflowName: string | null = null;
	try {
		const model = await createChatModel(config);
		const formattedHistory = formatMessagesForLLM(messages);
		const memoryManager = MemoryManager.getInstance(config);
		const currentProfile = await memoryManager.getProfile();

		const systemPrompt = `You are the combined profiling and workflow extraction assistant for Miniclaw.
Your tasks are:
1. Analyze the conversation history and refine the user's profile state:
   - Extract any new user traits, preferences, rules, or permanent observations. Keep traits concise (e.g. "Prefers TypeScript for development", "Uses dark mode").
   - Update the list of Long-Term Goals. This should ONLY capture significant long-term pursuits, academic objectives, career milestones, lifelong ambitions, or multi-day projects (e.g. "Build open-source compiler", "Learn Vietnamese", "Master machine learning"). Do NOT capture fleeting, immediate tasks, short-term commands, or scheduled alarms. Remove completed or abandoned goals, and append new ones.
   - Identify if the user's name or timezone was explicitly mentioned or can be inferred (e.g. "I'm in Tokyo now" -> "Asia/Tokyo").

2. Analyze the conversation history to identify repeated, successful command execution patterns or workflows where the assistant executed shell commands (specifically using the \`gws\` or \`lark-cli\` binaries for calendar, mail, contact, or task scopes) to achieve a goal.
   If you identify a reusable workflow pattern (consisting of a sequence of commands/actions or a recipe):
   Generate a new modular skill in the following Markdown format. The description should be a single sentence. The openclaw category MUST be "workflow". Ensure you list the required binaries in the frontmatter.
   The skill name must start with "workflow-" followed by lowercase letters, numbers, and hyphens (e.g. workflow-lark-freebusy, workflow-google-freebusy).
   
   ---
   name: <dash-separated-lowercase-name-starting-with-workflow->
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
   
   If no new, significant, or reusable workflow pattern is found in the history, the workflow should be exactly: NO_NEW_WORKFLOW

Current User Profile State:
- Traits: ${JSON.stringify(currentProfile.traits)}
- Long-Term Goals: ${JSON.stringify(currentProfile.activeGoals)}
- Username: ${currentProfile.username || "Unknown"}
- Timezone: ${currentProfile.timezone || "Unknown"}

Return your analysis strictly as a valid JSON object in the following format:
{
  "profile": {
    "username": "string or null",
    "timezone": "string or null",
    "traits": ["string", "string", ...],
    "activeGoals": ["string", "string", ...]
  },
  "workflow": "string (either the markdown workflow skill matching the format above, or exactly 'NO_NEW_WORKFLOW')"
}

Do NOT wrap the JSON in markdown blocks or include any other conversational preamble. Return ONLY the raw JSON string.`;

		const response = await model.invoke([
			new SystemMessage(systemPrompt),
			new HumanMessage(
				`Analyze this conversation history and perform profiling and workflow extraction:\n\n${formattedHistory}`,
			),
		]);

		let content =
			typeof response.content === "string" ? response.content.trim() : "";

		// Clean markdown wrapper if model accidentally included it
		if (content.startsWith("```json")) {
			content = content.substring(7);
		}
		if (content.endsWith("```")) {
			content = content.substring(0, content.length - 3);
		}
		content = content.trim();

		const parsed = JSON.parse(content);
		const updatedProfile = parsed.profile as UserProfile;
		if (
			updatedProfile &&
			Array.isArray(updatedProfile.traits) &&
			Array.isArray(updatedProfile.activeGoals)
		) {
			await memoryManager.updateProfileAndTimestamp(updatedProfile);
			logger.info(
				`[CompactionManager] Daily auto-summarization completed via combined call. Profile updated: ${JSON.stringify(
					updatedProfile,
				)}`,
			);
		}

		const workflowContent = (parsed.workflow || "").trim();

		if (
			workflowContent &&
			workflowContent !== "NO_NEW_WORKFLOW" &&
			workflowContent.includes("---")
		) {
			const { metadata } = SkillsManager.parseFrontmatterAs(
				workflowContent,
				SkillFrontmatterSchema,
			);
			if (metadata?.name) {
				let skillName = metadata.name.trim();
				let updatedContent = workflowContent;
				if (!skillName.startsWith("workflow-")) {
					const oldName = skillName;
					skillName = `workflow-${skillName}`;
					updatedContent = workflowContent.replace(
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

				if (!existsSync(targetSkillDir)) {
					// Do NOT write the file directly. Put it in ConsolidationState.
					await StateManager.saveConsolidationState(chatId, {
						active: true,
						proposedWorkflow: updatedContent,
						checkpointMessageCount: compactedMessages.length,
					});
					newWorkflowName = skillName;
					logger.info(
						`[CompactionManager] Proposed new workflow skill: ${skillName} saved to ConsolidationState.`,
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
			// Auto toggle consolidation state back to inactive if no workflow is extracted
			await StateManager.clearConsolidationState(chatId);
		}
	} catch (err) {
		logger.error(
			err,
			"[CompactionManager] Error during combined profiling and workflow extraction",
		);
	}

	return { compactedMessages, newWorkflowName };
}

/**
 * Manually forces conversation compaction using the built-in summarization middleware
 * and extracts workflows, while performing daily memory profiling.
 */
export async function forceCompactMessages(
	config: AppConfig,
	messages: BaseMessage[],
	chatId: string,
	channel: string,
	bus: MessageBus,
): Promise<{ compacted: BaseMessage[]; newWorkflow: string | null } | null> {
	if (messages.length === 0) return null;

	const workspaceDir = getWorkspaceDir(config.workspace_dir);
	const tokensBefore = estimateMessagesTokens(messages);
	const triggerTokens = config.agent.compaction_trigger_tokens ?? 50000;

	try {
		// 1. Publish initial notification outbound first to indicate start of process
		await bus.publishOutbound({
			channel,
			chat_id: chatId,
			content: "Compacting conversation and extracting workflows",
		});

		// 2. Run message compaction and workflow extraction (which also runs daily profiling internally)
		const { compactedMessages, newWorkflowName } =
			await compactAndExtractWorkflows(
				config,
				messages,
				workspaceDir,
				chatId,
				channel,
				bus,
			);

		const tokensAfter = estimateMessagesTokens(compactedMessages);
		const statsMsg = `Conversation compacted: ${formatTokens(tokensBefore)} tokens to ${formatTokens(tokensAfter)} tokens / ${formatTokens(triggerTokens)}`;

		let historyMsg = statsMsg;
		if (newWorkflowName) {
			historyMsg += `\n\nDiscovered new workflow: ${newWorkflowName}`;
		}

		// 3. Append SystemMessage containing the status
		const compactedWithMsg = [
			...compactedMessages,
			new SystemMessage(historyMsg),
		];

		// 4. Save to the checkpointer immediately
		if (chatId) {
			const { FileCheckpointSaver } = await import("./store");
			const checkpointer = new FileCheckpointSaver(chatId);
			checkpointer.messages = compactedWithMsg;
			await checkpointer.save();

			// 5. Update consolidation state checkpointMessageCount if active
			const condState = await StateManager.getConsolidationState(chatId);
			if (condState?.active) {
				condState.checkpointMessageCount = compactedWithMsg.length;
				await StateManager.saveConsolidationState(chatId, condState);
			}
		}

		// 6. Publish notification/compaction status (stats message) to the outbound bus first
		await bus.publishOutbound({
			channel,
			chat_id: chatId,
			content: statsMsg,
		});

		// 7. Publish natural language notification of workflow proposal if workflow was found
		if (newWorkflowName) {
			await bus.publishOutbound({
				channel,
				chat_id: chatId,
				content: `I've compacted our history and identified a reusable workflow pattern: "${newWorkflowName}".\n\nWould you like me to save this workflow for future use? Let me know if you want to keep it, make modifications, or discard it.`,
			});
		}

		return { compacted: compactedWithMsg, newWorkflow: newWorkflowName };
	} catch (err) {
		logger.error(
			err,
			"[CompactionManager] Failed manually compacting messages",
		);
		throw err;
	}
}
