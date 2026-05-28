import { existsSync, mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock home directory to isolate tests
const tempHome = path.join(os.tmpdir(), `miniclaw-skills-test-${Date.now()}`);
if (!existsSync(tempHome)) {
	mkdirSync(tempHome, { recursive: true });
}
vi.spyOn(os, "homedir").mockReturnValue(tempHome);

import { SkillsManager } from "@/agent/skills";

describe("Skills System Integration", () => {
	beforeEach(async () => {
		// Ensure fresh temp dir
		await fs.mkdir(tempHome, { recursive: true });
	});

	afterEach(async () => {
		// Clean up
		await fs.rm(tempHome, { recursive: true, force: true });
		vi.clearAllMocks();
	});

	describe("Indentation-Aware YAML Parser", () => {
		it("should parse simple flat key-value pairs", () => {
			const yaml = `
name: gws-gmail
description: Manage your daily communications.
version: 0.22.5
`;
			const parsed = SkillsManager.parseYaml(yaml);
			expect(parsed.name).toBe("gws-gmail");
			expect(parsed.description).toBe("Manage your daily communications.");
			expect(parsed.version).toBe("0.22.5");
		});

		it("should parse nested properties and arrays correctly", () => {
			const yaml = `
metadata:
  version: 0.22.5
  openclaw:
    category: "persona"
    requires:
      bins:
        - gws
      skills:
        - gws-gmail
        - gws-calendar
`;
			const parsed = SkillsManager.parseYaml(yaml);
			expect(parsed.metadata).toBeDefined();
			expect(parsed.metadata.version).toBe("0.22.5");
			expect(parsed.metadata.openclaw).toBeDefined();
			expect(parsed.metadata.openclaw.category).toBe("persona");
			expect(parsed.metadata.openclaw.requires).toBeDefined();
			expect(parsed.metadata.openclaw.requires.bins).toEqual(["gws"]);
			expect(parsed.metadata.openclaw.requires.skills).toEqual([
				"gws-gmail",
				"gws-calendar",
			]);
		});

		it("should parse frontmatter correctly using parseFrontmatter", () => {
			const fileContent = `---
name: gws-gmail
description: Simple description.
metadata:
  version: 1.0.0
---
# Skill Title
Body text goes here.
`;
			const { metadata, body } = SkillsManager.parseFrontmatter(fileContent);
			expect(metadata).toBeDefined();
			expect(metadata?.name).toBe("gws-gmail");
			expect(metadata?.metadata?.version).toBe("1.0.0");
			expect(body.trim()).toBe("# Skill Title\nBody text goes here.");
		});
	});

	describe("Dynamic Usage Statistics Tracking", () => {
		it("should initialize empty usage counts and increment counts dynamically", async () => {
			const stats = await SkillsManager.getUsageStats();
			expect(stats).toEqual({});

			// Increment skill
			await SkillsManager.incrementUsage("gws-gmail");
			const stats2 = await SkillsManager.getUsageStats();
			expect(stats2["gws-gmail"]).toBe(1);

			// Increment again
			await SkillsManager.incrementUsage("gws-gmail");
			const stats3 = await SkillsManager.getUsageStats();
			expect(stats3["gws-gmail"]).toBe(2);
		});
	});

	describe("Onboarding Clone Suite", () => {
		it("should successfully clone and copy mock template directories recursively", async () => {
			const srcDir = path.join(tempHome, "src-template");
			const destDir = path.join(tempHome, "dest-workspace");

			// Create a mock template skills directory structure
			const skill1Path = path.join(srcDir, "gws-gmail");
			await fs.mkdir(skill1Path, { recursive: true });
			await fs.writeFile(
				path.join(skill1Path, "SKILL.md"),
				"---name: gws-gmail---",
				"utf-8",
			);

			const skill2Path = path.join(srcDir, "gws-calendar");
			await fs.mkdir(skill2Path, { recursive: true });
			await fs.writeFile(
				path.join(skill2Path, "SKILL.md"),
				"---name: gws-calendar---",
				"utf-8",
			);

			// Perform mock cloning using private copyDirRecursive directly or via simulated loader
			// Since cloneTemplateSkills expects template directories inside workspace/src/template,
			// let's test our copyDirRecursive logic through a helper or mock source.
			// Let's assert our copy recursively works.
			// biome-ignore lint/suspicious/noExplicitAny: accessing private static copyDirRecursive for tests
			const copyResult = await (SkillsManager as any).copyDirRecursive(
				srcDir,
				destDir,
			);

			expect(copyResult).toBe(2);
			expect(existsSync(path.join(destDir, "gws-gmail", "SKILL.md"))).toBe(
				true,
			);
			expect(existsSync(path.join(destDir, "gws-calendar", "SKILL.md"))).toBe(
				true,
			);
		});
	});

	describe("Dynamic System Prompt catalog Generation", () => {
		it("should return dynamic discovery catalog only for active skills (usage > 0) sorted descending", async () => {
			const mockSkills = [
				{
					name: "gws-gmail",
					description: "Read mail",
					path: "skills/gws-gmail/SKILL.md",
				},
				{
					name: "gws-calendar",
					description: "Schedule holds",
					path: "skills/gws-calendar/SKILL.md",
				},
				{
					name: "recipe-focus",
					description: "Block focus",
					path: "skills/recipe-focus/SKILL.md",
				},
			];

			// Initial state: usage stats is empty
			const prompt1 = await SkillsManager.generatePromptBlock(mockSkills);
			expect(prompt1).toContain("none are pre-loaded in your prompt catalog");
			expect(prompt1).toContain("search_skills");

			// Update stats: gmail = 5, calendar = 10, recipe-focus = 0
			await SkillsManager.incrementUsage("gws-gmail");
			await SkillsManager.incrementUsage("gws-gmail");
			await SkillsManager.incrementUsage("gws-gmail");
			await SkillsManager.incrementUsage("gws-gmail");
			await SkillsManager.incrementUsage("gws-gmail"); // count 5

			await SkillsManager.incrementUsage("gws-calendar");
			await SkillsManager.incrementUsage("gws-calendar");
			await SkillsManager.incrementUsage("gws-calendar");
			await SkillsManager.incrementUsage("gws-calendar");
			await SkillsManager.incrementUsage("gws-calendar");
			await SkillsManager.incrementUsage("gws-calendar");
			await SkillsManager.incrementUsage("gws-calendar");
			await SkillsManager.incrementUsage("gws-calendar");
			await SkillsManager.incrementUsage("gws-calendar");
			await SkillsManager.incrementUsage("gws-calendar"); // count 10

			const prompt2 = await SkillsManager.generatePromptBlock(mockSkills);
			expect(prompt2).toContain("ACTIVE AGENT SKILLS (Top 10 most used)");
			expect(prompt2).toContain("gws-calendar");
			expect(prompt2).toContain("gws-gmail");
			expect(prompt2).not.toContain("recipe-focus"); // Count is 0, so not in the catalog list!

			// Verify sorting order: gws-calendar (10) must appear before gws-gmail (5)
			const idxCalendar = prompt2.indexOf("gws-calendar");
			const idxGmail = prompt2.indexOf("gws-gmail");
			expect(idxCalendar).toBeLessThan(idxGmail);
		});
	});
});
