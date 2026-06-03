import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { logger } from "@/utils/logger";
import { StateManager } from "./state";

export const SkillFrontmatterSchema = z.object({
	name: z.string(),
	description: z.string(),
	metadata: z
		.object({
			version: z.string().optional(),
			openclaw: z
				.object({
					category: z.string().optional(),
					requires: z
						.object({
							bins: z.array(z.string()).optional(),
							skills: z.array(z.string()).optional(),
						})
						.optional(),
				})
				.optional(),
		})
		.optional(),
});

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

export interface SkillMetadata {
	name: string;
	description: string;
	path: string;
	metadata?: SkillFrontmatter["metadata"];
}

// biome-ignore lint/complexity/noStaticOnlyClass: grouping static utility operations under SkillsManager namespace
export class SkillsManager {
	/**
	 * Indentation-aware YAML parser supporting nested objects and arrays.
	 */
	public static parseYaml(yamlStr: string): Record<string, unknown> {
		const result: Record<string, unknown> = {};
		const lines = yamlStr.split(/\r?\n/);
		const stack: Array<{
			indent: number;
			obj: Record<string, unknown> | unknown[];
			key: string | null;
		}> = [{ indent: -1, obj: result, key: null }];

		for (const line of lines) {
			if (!line.trim() || line.trim().startsWith("#")) continue;

			const indent = line.length - line.trimStart().length;
			const trimmed = line.trim();

			while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
				stack.pop();
			}

			const currentFrame = stack[stack.length - 1];

			if (trimmed.startsWith("- ")) {
				const val = trimmed
					.slice(2)
					.trim()
					.replace(/^['"]|['"]$/g, "");
				const parentFrame = stack[stack.length - 2];
				if (parentFrame && currentFrame.key) {
					const parentObj = parentFrame.obj as Record<string, unknown>;
					if (!Array.isArray(parentObj[currentFrame.key])) {
						parentObj[currentFrame.key] = [];
						currentFrame.obj = parentObj[currentFrame.key] as unknown[];
					}
					(parentObj[currentFrame.key] as unknown[]).push(val);
				}
			} else {
				const colonIdx = trimmed.indexOf(":");
				if (colonIdx !== -1) {
					const key = trimmed
						.slice(0, colonIdx)
						.trim()
						.replace(/^['"]|['"]$/g, "");
					const valStr = trimmed.slice(colonIdx + 1).trim();

					const currentObj = currentFrame.obj as Record<string, unknown>;
					if (valStr === "") {
						const newObj = {};
						currentObj[key] = newObj;
						stack.push({ indent, obj: newObj, key });
					} else {
						const val = valStr.replace(/^['"]|['"]$/g, "");
						currentObj[key] = val;
						stack.push({ indent, obj: currentObj, key });
					}
				}
			}
		}

		return result;
	}

	/**
	 * Parses and type-validates YAML string against a Zod schema.
	 */
	public static parseYamlAs<T>(yamlStr: string, schema: z.ZodType<T>): T {
		return schema.parse(SkillsManager.parseYaml(yamlStr));
	}

	/**
	 * Parses and type-validates YAML frontmatter enclosed in --- blocks against a Zod schema.
	 */
	public static parseFrontmatterAs<T>(
		content: string,
		schema: z.ZodType<T>,
	): {
		metadata: T | null;
		body: string;
	} {
		const match = content.match(/^---\r?\n([\s\S]+?)\r?\n---\r?\n([\s\S]*)$/);
		if (!match) return { metadata: null, body: content };
		try {
			const rawMetadata = SkillsManager.parseYaml(match[1]);
			const metadata = schema.parse(rawMetadata);
			return { metadata, body: match[2] };
		} catch {
			return { metadata: null, body: content };
		}
	}

	/**
	 * Parses YAML frontmatter enclosed in --- blocks.
	 */
	public static parseFrontmatter(content: string): {
		metadata: Record<string, unknown> | null;
		body: string;
	} {
		const match = content.match(/^---\r?\n([\s\S]+?)\r?\n---\r?\n([\s\S]*)$/);
		if (!match) return { metadata: null, body: content };
		try {
			const metadata = SkillsManager.parseYaml(match[1]);
			return { metadata, body: match[2] };
		} catch {
			return { metadata: null, body: content };
		}
	}

	private static validateSkillName(name: string): boolean {
		if (name.length < 1 || name.length > 64) return false;
		if (!/^[a-z0-9-]+$/.test(name)) return false;
		if (name.startsWith("-") || name.endsWith("-")) return false;
		if (name.includes("--")) return false;
		return true;
	}

	/**
	 * Reads the persistent skills-stats.json file.
	 */
	public static async getUsageStats(): Promise<Record<string, number>> {
		return StateManager.getSkillsStats();
	}

	/**
	 * Increments the usage count of a skill and saves it.
	 */
	public static async incrementUsage(skillName: string): Promise<void> {
		await StateManager.incrementSkill(skillName);
	}

	/**
	 * Clones template skills to active workspace on onboarding initialization.
	 */
	public static async cloneTemplateSkills(workspaceDir: string): Promise<void> {
		let templateSkillsPath = path.resolve(__dirname, "../src/template/skills");
		if (!existsSync(templateSkillsPath)) {
			templateSkillsPath = path.resolve(__dirname, "../../src/template/skills");
		}
		if (!existsSync(templateSkillsPath)) {
			templateSkillsPath = path.resolve(process.cwd(), "src/template/skills");
		}

		if (!existsSync(templateSkillsPath)) {
			logger.warn(
				"[Onboarding] Template skills path not found. Skipping clone.",
			);
			return;
		}

		const destPath = path.resolve(workspaceDir, "skills");
		try {
			const count = await SkillsManager.copyDirRecursive(
				templateSkillsPath,
				destPath,
			);
			logger.info(
				`[Onboarding] Successfully prepared ${count} skills for miniclaw at: ${destPath}`,
			);
		} catch (err) {
			logger.error(err, "[Onboarding] Failed recursive copy of skills suite");
		}
	}

	/**
	 * @internal For testing purposes only
	 */
	public static async copyDirRecursive(
		src: string,
		dest: string,
	): Promise<number> {
		let copyCount = 0;
		await fs.mkdir(dest, { recursive: true });
		const entries = await fs.readdir(src, { withFileTypes: true });

		for (const entry of entries) {
			const srcPath = path.join(src, entry.name);
			const destPath = path.join(dest, entry.name);

			if (entry.isDirectory()) {
				copyCount += await SkillsManager.copyDirRecursive(srcPath, destPath);
				// Each direct directory immediately below the source root represents one skill suite
				if (path.dirname(srcPath) === src) {
					copyCount++;
				}
			} else {
				await fs.copyFile(srcPath, destPath);
			}
		}
		return copyCount;
	}

	/**
	 * Scans configured directories in the workspace and resolves all valid skills.
	 * Path resolution formats relative paths relative to workspace Dir.
	 */
	public static async loadSkills(
		workspaceDir: string,
		skillsDirs: string[],
	): Promise<SkillMetadata[]> {
		const skills: SkillMetadata[] = [];
		const seenNames = new Set<string>();

		for (const dirName of skillsDirs) {
			const targetDir = path.resolve(workspaceDir, dirName);
			try {
				const entries = await fs.readdir(targetDir, { withFileTypes: true });
				const subdirs = entries.filter((e) => e.isDirectory());

				for (const subdir of subdirs) {
					const skillName = subdir.name;
					const skillDir = path.join(targetDir, skillName);
					const skillMdPath = path.join(skillDir, "SKILL.md");

					try {
						const content = await fs.readFile(skillMdPath, "utf-8");
						const { metadata } = SkillsManager.parseFrontmatterAs(
							content,
							SkillFrontmatterSchema,
						);

						if (!metadata) {
							continue;
						}

						const declaredName = metadata.name.trim();
						if (
							declaredName !== skillName ||
							!SkillsManager.validateSkillName(declaredName)
						) {
							continue;
						}

						if (seenNames.has(declaredName)) {
							continue;
						}

						seenNames.add(declaredName);
						skills.push({
							name: declaredName,
							description: metadata.description.trim(),
							path: path
								.relative(workspaceDir, skillMdPath)
								.replace(/\\/g, "/"),
							metadata: metadata.metadata,
						});
					} catch {
						// Skip
					}
				}
			} catch {
				// Skip
			}
		}

		return skills;
	}

	/**
	 * Generates system prompt block injecting discovered workflows and the top 10 most used standard skills.
	 */
	public static async generatePromptBlock(
		skills: SkillMetadata[],
	): Promise<string> {
		const stats = await SkillsManager.getUsageStats();

		const skillsWithUsage = skills.map((s) => ({
			...s,
			usageCount: stats[s.name] || 0,
		}));

		const workflows = skillsWithUsage
			.filter((s) => s.metadata?.openclaw?.category === "workflow")
			.sort((a, b) => b.usageCount - a.usageCount)
			.slice(0, 10);
		const standardSkills = skillsWithUsage.filter(
			(s) => s.metadata?.openclaw?.category !== "workflow",
		);

		const activeStandardSkills = standardSkills
			.filter((s) => s.usageCount > 0)
			.sort((a, b) => b.usageCount - a.usageCount)
			.slice(0, 10);

		if (workflows.length === 0 && activeStandardSkills.length === 0) {
			logger.info(
				"[Skills] Prompt injection skipped: No active standard skills or workflows discovered.",
			);
			return (
				"## SKILLS & WORKFLOWS\n" +
				"You have access to a rich suite of modular skills and workflows. Because you haven't used any skills or workflows yet on this session, none are pre-loaded in your prompt catalog.\n" +
				"To search and discover available skills and workflows, you MUST call the `search_skills` tool first to find relevant guidelines and paths."
			);
		}

		logger.info(
			`[Skills] Prompt injected with ${workflows.length} workflows and ${activeStandardSkills.length} active standard skills.`,
		);

		let block = "";

		if (workflows.length > 0) {
			block += "## ESTABLISHED WORKFLOWS (Top 10 most used)\n";
			block +=
				"You have access to the following automated workflows. If you need to execute any of these, you MUST first read the detailed instructions inside its corresponding `SKILL.md` using `read_file` before proceeding.\n\n";
			block += "| Name | Description | Instruction Path | Usages |\n";
			block += "| :--- | :--- | :--- | :--- |\n";
			for (const wf of workflows) {
				block += `| **${wf.name}** | ${wf.description} | \`${wf.path}\` | ${wf.usageCount} |\n`;
			}
			block += "\n";
		}

		if (activeStandardSkills.length > 0) {
			block += "## ACTIVE AGENT SKILLS (Top 10 most used)\n";
			block +=
				"You have access to the following frequently used skills. If you need to perform a task matching any of these, you MUST first read the detailed instructions inside its corresponding `SKILL.md` using `read_file` before proceeding.\n\n";
			block += "| Name | Description | Instruction Path | Usages |\n";
			block += "| :--- | :--- | :--- | :--- |\n";
			for (const skill of activeStandardSkills) {
				block += `| **${skill.name}** | ${skill.description} | \`${skill.path}\` | ${skill.usageCount} |\n`;
			}
			block +=
				"\nFor other tasks not listed above, call the `search_skills` tool to search the full catalog of skills and workflows.";
		} else {
			block += "## ACTIVE AGENT SKILLS\n";
			block +=
				"To search and discover available general skills and workflows, you MUST call the `search_skills` tool first to find relevant guidelines and paths.";
		}

		return block.trim();
	}
}
