import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Spy on os.homedir BEFORE importing modules that depend on it
const tempHome = path.resolve(__dirname, "tmp-home");
vi.spyOn(os, "homedir").mockReturnValue(tempHome);

import {
	AIMessage,
	HumanMessage,
	SystemMessage,
	ToolMessage,
} from "@langchain/core/messages";
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

	describe("FileCheckpointSaver (Vanilla LangChain message persistence)", () => {
		it("should start with empty messages if no checkpoint exists", async () => {
			const store = new FileCheckpointSaver(chatId);
			await store.load();
			expect(store.messages).toEqual([]);
		});

		it("should save and load messages correctly, maintaining types", async () => {
			const store = new FileCheckpointSaver(chatId);
			await store.load();

			store.messages = [
				new HumanMessage("hello"),
				new AIMessage({
					content: "hi there",
					tool_calls: [{ name: "read_file", args: {}, id: "tc-1" }],
				}),
				new SystemMessage("system settings"),
				new ToolMessage({
					content: "file content",
					tool_call_id: "tc-1",
					name: "read_file",
				}),
			];
			await store.save();

			const reloadStore = new FileCheckpointSaver(chatId);
			await reloadStore.load();
			expect(reloadStore.messages.length).toBe(4);

			expect(reloadStore.messages[0]).toBeInstanceOf(HumanMessage);
			expect(reloadStore.messages[0].content).toBe("hello");

			expect(reloadStore.messages[1]).toBeInstanceOf(AIMessage);
			expect(reloadStore.messages[1].content).toBe("hi there");
			expect((reloadStore.messages[1] as AIMessage).tool_calls).toEqual([
				{ name: "read_file", args: {}, id: "tc-1" },
			]);

			expect(reloadStore.messages[2]).toBeInstanceOf(SystemMessage);
			expect(reloadStore.messages[2].content).toBe("system settings");

			expect(reloadStore.messages[3]).toBeInstanceOf(ToolMessage);
			expect(reloadStore.messages[3].content).toBe("file content");
			expect((reloadStore.messages[3] as ToolMessage).tool_call_id).toBe(
				"tc-1",
			);
			expect((reloadStore.messages[3] as ToolMessage).name).toBe("read_file");
		});

		it("should archive checkpoint file correctly", async () => {
			const store = new FileCheckpointSaver(chatId);
			store.messages = [new HumanMessage("archived msg")];
			await store.save();

			await store.archive();
			expect(store.messages).toEqual([]);

			const reloadStore = new FileCheckpointSaver(chatId);
			await reloadStore.load();
			expect(reloadStore.messages).toEqual([]);

			// Check that an archived file exists in the directory
			const sessionsDir = path.join(tempHome, ".miniclaw", "sessions", chatId);
			const files = await fs.readdir(sessionsDir);
			const archiveFile = files.find(
				(f) => f.startsWith("checkpoint_") && f.endsWith(".json"),
			);
			expect(archiveFile).toBeDefined();
		});

		it("should clear checkpoint file correctly", async () => {
			const store = new FileCheckpointSaver(chatId);
			store.messages = [new HumanMessage("wipe me")];
			await store.save();

			await store.clear();
			expect(store.messages).toEqual([]);

			const reloadStore = new FileCheckpointSaver(chatId);
			await reloadStore.load();
			expect(reloadStore.messages).toEqual([]);
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
