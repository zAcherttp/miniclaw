import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { getAppDir } from "@/config/paths";
import { logger } from "@/utils/logger";

export interface SkillMetadata {
	name: string;
	description: string;
	path: string;
	metadata?: {
		version?: string;
		openclaw?: {
			category?: string;
			requires?: {
				bins?: string[];
				skills?: string[];
			};
		};
	};
}

// biome-ignore lint/complexity/noStaticOnlyClass: grouping static utility operations under SkillsManager namespace
export class SkillsManager {
	/**
	 * Indentation-aware YAML parser supporting nested objects and arrays.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: yaml parsing returns arbitrary structure mapping
	public static parseYaml(yamlStr: string): Record<string, any> {
		// biome-ignore lint/suspicious/noExplicitAny: parsing returns arbitrary key value properties
		const result: Record<string, any> = {};
		const lines = yamlStr.split(/\r?\n/);
		// biome-ignore lint/suspicious/noExplicitAny: stack manages recursive indentation frame bindings
		const stack: Array<{ indent: number; obj: any; key: string | null }> = [
			{ indent: -1, obj: result, key: null },
		];

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
					if (!Array.isArray(parentFrame.obj[currentFrame.key])) {
						parentFrame.obj[currentFrame.key] = [];
						currentFrame.obj = parentFrame.obj[currentFrame.key];
					}
					parentFrame.obj[currentFrame.key].push(val);
				}
			} else {
				const colonIdx = trimmed.indexOf(":");
				if (colonIdx !== -1) {
					const key = trimmed
						.slice(0, colonIdx)
						.trim()
						.replace(/^['"]|['"]$/g, "");
					const valStr = trimmed.slice(colonIdx + 1).trim();

					if (valStr === "") {
						const newObj = {};
						currentFrame.obj[key] = newObj;
						stack.push({ indent, obj: newObj, key });
					} else {
						const val = valStr.replace(/^['"]|['"]$/g, "");
						currentFrame.obj[key] = val;
						stack.push({ indent, obj: currentFrame.obj, key });
					}
				}
			}
		}

		return result;
	}

	/**
	 * Parses YAML frontmatter enclosed in --- blocks.
	 */
	public static parseFrontmatter(content: string): {
		// biome-ignore lint/suspicious/noExplicitAny: frontmatter parsing returns custom nested any properties
		metadata: Record<string, any> | null;
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
		const statsPath = path.join(getAppDir(), "skills-stats.json");
		try {
			const data = await fs.readFile(statsPath, "utf-8");
			return JSON.parse(data);
		} catch {
			return {};
		}
	}

	/**
	 * Increments the usage count of a skill and saves it.
	 */
	public static async incrementUsage(skillName: string): Promise<void> {
		const statsPath = path.join(getAppDir(), "skills-stats.json");
		const stats = await SkillsManager.getUsageStats();
		const beforeCount = stats[skillName] || 0;
		const newCount = beforeCount + 1;
		stats[skillName] = newCount;
		try {
			await fs.writeFile(statsPath, JSON.stringify(stats, null, 2), "utf-8");
			logger.info(
				`[SkillsStats] Incremented usage count for skill "${skillName}" (${beforeCount} -> ${newCount})`,
			);
		} catch (err) {
			logger.error(err, "[SkillsStats] Failed to save usage count update");
		}
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

	private static async copyDirRecursive(
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
						const { metadata } = SkillsManager.parseFrontmatter(content);

						if (!metadata?.name || !metadata.description) {
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
	 * Generates system prompt block injecting only the top 10 most used active skills.
	 */
	public static async generatePromptBlock(
		skills: SkillMetadata[],
	): Promise<string> {
		const stats = await SkillsManager.getUsageStats();

		const skillsWithUsage = skills.map((s) => ({
			...s,
			usageCount: stats[s.name] || 0,
		}));

		const activeSkills = skillsWithUsage
			.filter((s) => s.usageCount > 0)
			.sort((a, b) => b.usageCount - a.usageCount)
			.slice(0, 10);

		if (activeSkills.length === 0) {
			logger.info(
				"[Skills] Prompt injection skipped: No active skills discovered (all counts are 0).",
			);
			return (
				"\n## DYNAMIC AGENT SKILLS\n" +
				"You have access to a rich suite of modular agent skills. Because you haven't used any skills yet on this session, none are pre-loaded in your prompt catalog.\n" +
				"To search and discover available skills, you MUST call the `search_skills` tool first to find relevant guidelines and paths.\n"
			);
		}

		logger.info(
			`[Skills] Prompt injected with ${activeSkills.length} top active skills catalog.`,
		);

		let block = "\n## ACTIVE AGENT SKILLS (Top 10 most used)\n";
		block +=
			"You have access to the following frequently used skills. If you need to perform a task matching any of these, you MUST first read the detailed instructions inside its corresponding `SKILL.md` using `read_file` before proceeding.\n\n";

		for (const skill of activeSkills) {
			block += `* **${skill.name}**: ${skill.description} (Read instructions from: \`${skill.path}\` | Usage count: ${skill.usageCount})\n`;
		}

		block +=
			"\nFor other tasks not listed above, call the `search_skills` tool to search the full skill catalog.\n";
		return block;
	}
}
