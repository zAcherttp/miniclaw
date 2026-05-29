import fs from "node:fs/promises";
import path from "node:path";
import { getAppDir } from "@/config/paths";

export const ContextEngineeringManager = {
	/**
	 * Loads global memory files (e.g. AGENTS.md in the active workspace and ~/.miniclaw/preferences.md)
	 * and returns them formatted as a guidelines block for the system prompt.
	 */
	async loadMemoryFiles(workspaceDir: string): Promise<string> {
		const guidelines: string[] = [];

		// 1. Load AGENTS.md from the active workspace
		try {
			const agentsPath = path.resolve(workspaceDir, "AGENTS.md");
			const content = await fs.readFile(agentsPath, "utf-8");
			guidelines.push(`### WORKSPACE MEMORY (AGENTS.md):\n${content}`);
		} catch {
			// Ignore if not present in the workspace
		}

		// 2. Load preferences.md from the ~/.miniclaw folder
		try {
			const prefPath = path.join(getAppDir(), "preferences.md");
			const content = await fs.readFile(prefPath, "utf-8");
			guidelines.push(`### USER PREFERENCES (preferences.md):\n${content}`);
		} catch {
			// Ignore if not present
		}

		if (guidelines.length === 0) {
			return "";
		}

		return `## PERSISTENT CONTEXT & ALIGNMENT GUIDELINES:\n${guidelines.join("\n\n")}`;
	},
};
