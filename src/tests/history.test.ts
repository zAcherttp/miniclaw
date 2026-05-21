import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Spy on os.homedir BEFORE importing modules that depend on it
const tempHome = path.resolve(__dirname, "tmp-home");
vi.spyOn(os, "homedir").mockReturnValue(tempHome);

import { ContextEngineeringManager } from "../agent/history";
import { FileCheckpointSaver } from "../agent/store";

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

	describe("FileCheckpointSaver (LangGraph persistence)", () => {
		it("should start with empty storage if no checkpoint exists", async () => {
			const checkpointer = new FileCheckpointSaver(chatId);
			await checkpointer.load();
			expect(checkpointer.storage).toEqual({});
		});

		it("should save and load checkpoints correctly", async () => {
			const checkpointer = new FileCheckpointSaver(chatId);
			await checkpointer.load();

			// Mock placing a value in storage
			// biome-ignore lint/suspicious/noExplicitAny: Test mock - intentionally setting MemorySaver internals
			checkpointer.storage = { "some-key": { checkpoint: "data" } } as any;
			await checkpointer.save();

			const reloadCheckpointer = new FileCheckpointSaver(chatId);
			await reloadCheckpointer.load();
			expect(reloadCheckpointer.storage).toEqual({
				"some-key": { checkpoint: "data" },
			});
		});

		it("should archive checkpoint file correctly", async () => {
			const checkpointer = new FileCheckpointSaver(chatId);
			// biome-ignore lint/suspicious/noExplicitAny: Test mock - intentionally setting MemorySaver internals
			checkpointer.storage = { "some-key": { checkpoint: "data" } } as any;
			await checkpointer.save();

			await checkpointer.archive();
			expect(checkpointer.storage).toEqual({});

			const reloadCheckpointer = new FileCheckpointSaver(chatId);
			await reloadCheckpointer.load();
			expect(reloadCheckpointer.storage).toEqual({});

			// Check that an archived file exists in the directory
			const sessionsDir = path.join(tempHome, ".miniclaw", "sessions", chatId);
			const files = await fs.readdir(sessionsDir);
			const archiveFile = files.find(
				(f) => f.startsWith("checkpoint_") && f.endsWith(".json"),
			);
			expect(archiveFile).toBeDefined();
		});

		it("should clear checkpoint file correctly", async () => {
			const checkpointer = new FileCheckpointSaver(chatId);
			// biome-ignore lint/suspicious/noExplicitAny: Test mock - intentionally setting MemorySaver internals
			checkpointer.storage = { "some-key": { checkpoint: "data" } } as any;
			await checkpointer.save();

			await checkpointer.clear();
			expect(checkpointer.storage).toEqual({});

			const reloadCheckpointer = new FileCheckpointSaver(chatId);
			await reloadCheckpointer.load();
			expect(reloadCheckpointer.storage).toEqual({});
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
