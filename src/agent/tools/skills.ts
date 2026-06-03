import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AppConfig } from "@/config/schema";
import { logger } from "@/utils/logger";
import { SkillsManager } from "../skills";

export const createSearchSkillsTool = (
	appConfig: AppConfig,
	workspaceDir: string,
) => {
	return new DynamicStructuredTool({
		name: "search_skills",
		description:
			"Searches for matching skills and workflows in your modular skill/workflow suite. Returns up to 5 matching metadata items (including their relative paths) so you can read their SKILL.md for instructions.",
		schema: z.object({
			query: z
				.string()
				.describe(
					"Case-insensitive keyword to search for in skill or workflow names, descriptions, or categories.",
				),
		}),
		func: async ({ query }) => {
			try {
				logger.info(`[Skills] search_skills invoked with query "${query}"`);
				const skillsDirs = appConfig.agent.skills_dirs ?? ["skills"];
				const loadedSkills = await SkillsManager.loadSkills(
					workspaceDir,
					skillsDirs,
				);
				const loadedWorkflows = await SkillsManager.loadSkills(workspaceDir, [
					"workflows",
				]);
				const allSkills = [...loadedSkills, ...loadedWorkflows];
				const term = query.toLowerCase();

				const matches = allSkills.filter((s) => {
					return (
						s.name.toLowerCase().includes(term) ||
						s.description.toLowerCase().includes(term) ||
						s.metadata?.openclaw?.category?.toLowerCase().includes(term) ||
						s.metadata?.openclaw?.requires?.skills?.some((dep) =>
							dep.toLowerCase().includes(term),
						)
					);
				});

				if (matches.length === 0) {
					logger.info(
						`[Skills] No skills or workflows matched query "${query}"`,
					);
					return `No skills or workflows matched your query "${query}". Try different keywords.`;
				}

				logger.info(
					`[Skills] Found ${matches.length} matching skills/workflows for query "${query}". Returning top 5.`,
				);
				const formatted = matches.slice(0, 5).map((m) => ({
					name: m.name,
					description: m.description,
					path: m.path,
					metadata: m.metadata,
				}));

				return JSON.stringify(formatted, null, 2);
			} catch (err: unknown) {
				const error = err as Error;
				logger.error(error, "[Skills] Error running search_skills");
				return `Error searching skills: ${error.message || error}`;
			}
		},
	});
};
