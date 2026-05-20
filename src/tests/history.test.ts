import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Spy on os.homedir BEFORE importing modules that depend on it
const tempHome = path.resolve(__dirname, "tmp-home");
vi.spyOn(os, "homedir").mockReturnValue(tempHome);

import { ContextEngineeringManager, SessionHistory } from "../agent/history";

describe("Thread History & Context Engineering Manager", () => {
	const chatId = "test-chat-123";
	const workspaceDir = path.join(tempHome, "workspace");

	beforeAll(async () => {
		await fs.rm(tempHome, { recursive: true, force: true });
		await fs.mkdir(tempHome, { recursive: true });
		await fs.mkdir(workspaceDir, { recursive: true });
	});

	afterAll(async () => {
		await fs.rm(tempHome, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	describe("SessionHistory (JSONL history tracking)", () => {
		it("should return empty history if thread is new", async () => {
			const history = new SessionHistory(chatId);
			const logs = await history.loadHistory();
			expect(logs).toEqual([]);
		});

		it("should append and load chat messages correctly", async () => {
			const history = new SessionHistory(chatId);
			await history.appendMessage("user", "Hello assistant");
			await history.appendMessage("assistant", "Hello human, how can I help?");

			const logs = await history.loadHistory();
			expect(logs.length).toBe(2);

			expect(logs[0].constructor.name).toBe("HumanMessage");
			expect(logs[0].content).toBe("Hello assistant");

			expect(logs[1].constructor.name).toBe("AIMessage");
			expect(logs[1].content).toBe("Hello human, how can I help?");
		});
	});

	describe("ContextEngineeringManager", () => {
		it("should return empty string if guidelines files do not exist", async () => {
			const res = await ContextEngineeringManager.loadMemoryFiles(workspaceDir);
			expect(res).toBe("");
		});

		it("should load workspace AGENTS.md and user preferences.md instructions", async () => {
			// Write mock AGENTS.md in workspace
			await fs.writeFile(
				path.join(workspaceDir, "AGENTS.md"),
				"Convention A\nConvention B",
				"utf-8",
			);

			// Write mock preferences.md in home's .miniclaw folder
			const appDir = path.join(tempHome, ".miniclaw");
			await fs.mkdir(appDir, { recursive: true });
			await fs.writeFile(
				path.join(appDir, "preferences.md"),
				"Prefer sleek modes",
				"utf-8",
			);

			const res = await ContextEngineeringManager.loadMemoryFiles(workspaceDir);
			expect(res).toContain("### WORKSPACE MEMORY (AGENTS.md):");
			expect(res).toContain("Convention A");
			expect(res).toContain("### USER PREFERENCES (preferences.md):");
			expect(res).toContain("Prefer sleek modes");
		});
	});
});
