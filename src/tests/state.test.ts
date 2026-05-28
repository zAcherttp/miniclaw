import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StateManager } from "@/agent/state";

describe("Centralized App StateManager Daemon", () => {
	let tempHome: string;

	beforeEach(async () => {
		tempHome = path.join(os.tmpdir(), `miniclaw-state-test-${Date.now()}`);
		await fs.mkdir(tempHome, { recursive: true });

		// Mock os.homedir or getAppDir path resolution by mocking path/process env
		// StateManager filePath points to path.join(getAppDir(), "state.json")
		// getAppDir() is located in C:\Users\Salad\.gemini\antigravity on Windows,
		// but let's override StateManager.filePath directly for isolated testing!
		const testFilePath = path.join(tempHome, "state.json");
		// biome-ignore lint/suspicious/noExplicitAny: overriding private static path for isolated unit tests
		(StateManager as any).filePath = testFilePath;
	});

	afterEach(async () => {
		await fs.rm(tempHome, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it("should load default state if file does not exist", async () => {
		const state = await StateManager.load();
		expect(state.lastActiveChat).toBeNull();
		expect(state.skillsStats).toEqual({});
		expect(state.telegramStreams).toEqual([]);
	});

	it("should persist and restore active chat details", async () => {
		const session = {
			channel: "test-channel",
			chatId: "chat-999",
			timestamp: new Date().toISOString(),
		};

		await StateManager.saveLastActiveChat(session);
		const restored = await StateManager.getLastActiveChat();

		expect(restored).not.toBeNull();
		expect(restored?.channel).toBe("test-channel");
		expect(restored?.chatId).toBe("chat-999");
	});

	it("should increment skills statistics counts and save correctly", async () => {
		await StateManager.incrementSkill("my-skill");
		await StateManager.incrementSkill("my-skill");

		const stats = await StateManager.getSkillsStats();
		expect(stats["my-skill"]).toBe(2);
	});

	it("should save and restore telegram active streaming buffers", async () => {
		const mockStreams: Array<[string, unknown]> = [
			["chat-1", { text: "hello", chat_id: "chat-1" }],
		];

		await StateManager.saveTelegramStreams(mockStreams);
		const restored = await StateManager.getTelegramStreams();

		expect(restored).toEqual(mockStreams);
	});

	it("should handle high concurrent updates safely using promise write-chaining queue", async () => {
		// Fire 10 parallel skill increment requests concurrently
		const promises = Array.from({ length: 10 }).map(() =>
			StateManager.incrementSkill("concurrent-skill"),
		);

		await Promise.all(promises);

		const stats = await StateManager.getSkillsStats();
		// Verify that all 10 increments were successfully completed without any lost counts
		expect(stats["concurrent-skill"]).toBe(10);
	});
});
