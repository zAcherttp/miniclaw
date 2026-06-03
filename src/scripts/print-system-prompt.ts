/**
 * Helper Script: Print System Prompt & Tools Schema
 *
 * NOTATION ON HOW TO RUN:
 * Open your command prompt (cmd) in the project root directory and run:
 *
 *   cmd /c "pnpm exec tsx src/scripts/print-system-prompt.ts"
 *
 * Description:
 * This script dynamically constructs and prints the exact system prompt block
 * compiled for the ReAct Agent during a message execution cycle, alongside the
 * complete list of bound tools and their parameters, without making any LLM API calls.
 */

import { createMainAgent } from "../agent/agents";
import { ContextEngineeringManager } from "../agent/history";
import { DEFAULT_SYSTEM_PROMPT } from "../agent/loop";
import { MemoryManager } from "../agent/memory";
import { SkillsManager } from "../agent/skills";
import { getSystemInfoBlock } from "../agent/systemInfo";
import { estimateTokens } from "../agent/tokenizer";
import { MessageBus } from "../bus/queue";
import { loadConfig } from "../config/loader";
import { getWorkspaceDir } from "../config/paths";
import { logger } from "../utils/logger";

// Suppress excessive logs to ensure clean stdout output of the prompt
logger.level = "silent";

type ZodSchemaType = {
	shape?: Record<string, ZodFieldType>;
};

type ZodFieldType = {
	_def?: {
		type?: string;
		innerType?: ZodFieldType;
		entries?: string[];
		values?: string[];
	};
	constructor: { name: string };
	description?: string;
};

type SimpleToolType = {
	name: string;
	description?: string;
	schema?: ZodSchemaType;
};

function formatZodSchema(schema: ZodSchemaType | undefined): string {
	if (!schema?.shape) {
		return "    (No parameters)";
	}
	const shape = schema.shape;
	let out = "";
	for (const [key, value] of Object.entries(shape)) {
		const val: ZodFieldType = value;
		let typeName = val._def?.type || val.constructor.name || "string";
		let isOptional = false;
		const description = val.description || "";
		let enumValues: string[] = [];

		let currentVal: ZodFieldType | undefined = val;
		// Unpack ZodOptional, ZodNullable, ZodDefault wrappers dynamically
		while (currentVal) {
			const type = currentVal._def?.type || currentVal.constructor.name;
			if (
				type === "optional" ||
				type === "nullable" ||
				type === "default" ||
				currentVal.constructor.name === "ZodOptional" ||
				currentVal.constructor.name === "ZodNullable" ||
				currentVal.constructor.name === "ZodDefault"
			) {
				isOptional = true;
				currentVal = currentVal._def?.innerType;
			} else if (type === "enum" || currentVal.constructor.name === "ZodEnum") {
				typeName = "enum";
				enumValues = currentVal._def?.entries || currentVal._def?.values || [];
				break;
			} else {
				typeName = type || currentVal.constructor.name || typeName;
				break;
			}
		}

		const optLabel = isOptional ? " (optional)" : " (REQUIRED)";
		const enumLabel =
			enumValues.length > 0
				? ` [${enumValues.map((v) => `'${v}'`).join(", ")}]`
				: "";

		const cleanTypeName = typeName.replace(/^Zod/, "");
		const capitalizedTypeName =
			cleanTypeName.charAt(0).toUpperCase() + cleanTypeName.slice(1);

		out += `  - **${key}** (${capitalizedTypeName})${optLabel}${enumLabel}`;
		if (description) {
			out += `: ${description}`;
		}
		out += "\n";
	}
	return out;
}

async function main() {
	const appConfig = loadConfig();
	const workspaceDir = getWorkspaceDir(appConfig.workspace_dir);
	const bus = new MessageBus();

	console.log("=".repeat(80));
	console.log(`[SYS-PROMPT-BUILDER] Active Workspace: ${workspaceDir}`);
	console.log("=".repeat(80));

	// 1. Load latest memory/context guidelines dynamically
	const memoryContext =
		await ContextEngineeringManager.loadMemoryFiles(workspaceDir);

	// 2. Fetch and inject User Profile & Goals memory dynamically
	let memoryPrompt = "";
	try {
		const memoryManager = MemoryManager.getInstance(appConfig);
		memoryPrompt = await memoryManager.generatePromptBlock();
	} catch (err) {
		console.warn(
			`[Warning] Failed to fetch User Profile memory: ${(err as Error).message}`,
		);
	}

	// 3. Load dynamic active skills & workflows
	const skillsDirs = appConfig?.agent?.skills_dirs ?? ["skills"];
	let skillsPrompt = "";
	try {
		const loadedSkills = await SkillsManager.loadSkills(
			workspaceDir,
			skillsDirs,
		);
		const loadedWorkflows = await SkillsManager.loadSkills(workspaceDir, [
			"workflows",
		]);
		skillsPrompt = await SkillsManager.generatePromptBlock([
			...loadedSkills,
			...loadedWorkflows,
		]);
	} catch (err) {
		console.warn(
			`[Warning] Failed to load dynamic agent skills: ${(err as Error).message}`,
		);
	}

	// 4. Build system info environment block
	const systemInfoBlock = getSystemInfoBlock(workspaceDir);

	// 5. Build tools block exactly like the print format
	let toolsPrompt = "";
	try {
		const agent = await createMainAgent(appConfig, workspaceDir, bus);
		const tools = (agent.options.tools || []) as SimpleToolType[];
		if (tools.length > 0) {
			const toolBlocks = tools.map((tool) => {
				return [
					`### Tool: ${tool.name}`,
					`*Description*: ${(tool.description || "").trim()}`,
					"*Parameters*:",
					formatZodSchema(tool.schema).trim(),
				].join("\n");
			});
			toolsPrompt = `## TOOLS\n${toolBlocks.join("\n\n")}`;
		}
	} catch (err) {
		console.warn(`[Warning] Failed to load tools: ${(err as Error).message}`);
	}

	// 6. Compose full prompt
	const basePrompt = DEFAULT_SYSTEM_PROMPT;
	const promptParts = [
		basePrompt,
		systemInfoBlock,
		memoryContext,
		skillsPrompt,
		memoryPrompt,
		toolsPrompt,
	].filter(Boolean);
	const systemPrompt = `${promptParts.map((p) => p.trim()).join("\n\n")}\n`;

	console.log("--- SYSTEM PROMPT ---");
	console.log(systemPrompt);
	console.log(`\n${"=".repeat(80)}`);
	console.log("--- SYSTEM PROMPT STATS ---");
	const stats = estimateTokens(systemPrompt);
	console.log(`Token Count: ${stats.tokens}`);
	console.log(`Character Count: ${stats.chars}`);
	console.log(`\n${"=".repeat(80)}`);

	console.log(
		"[SYS-PROMPT-BUILDER] Composed system prompt & tools catalog printed successfully!",
	);
	console.log("=".repeat(80));
}

main().catch((err) => {
	console.error("Error executing system prompt builder:", err);
	process.exit(1);
});
