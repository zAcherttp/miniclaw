import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

// Spy on os.homedir BEFORE importing modules that depend on it
const tempHome = fsSync.mkdtempSync(path.join(os.tmpdir(), "miniclaw-memory-"));
vi.spyOn(os, "homedir").mockReturnValue(tempHome);

import type { EmbeddingsLike } from "../agent/memory";
import * as memoryModule from "../agent/memory";
import { createRecallTool, createRememberTool } from "../agent/tools/memory";
import type { AppConfig } from "../config/schema";

describe("Offline Memory & Semantic Recall Infrastructure", () => {
	const mockConfig: AppConfig = {
		agent: {
			model: "ollama:gemma4:31b-cloud",
			max_iterations: 15,
			temperature: 0.7,
			compaction_trigger_tokens: 220000,
			skills_dirs: ["skills"],
		},
		channels: {
			telegram: {
				enabled: false,
				streaming: true,
				allowFrom: [""],
			},
		},
		workspace_dir: "~/workspace",
		log_level: "INFO",
		environment: {},
	};

	beforeAll(async () => {
		await fs.rm(tempHome, { recursive: true, force: true });
		await fs.mkdir(tempHome, { recursive: true });
	});

	beforeEach(async () => {
		// Clean up the memory store folder before each test to start fresh
		const storeDir = path.join(tempHome, ".miniclaw", "memory_store");
		await fs.rm(storeDir, { recursive: true, force: true });
		memoryModule.MemoryManager.resetInstance();
	});

	afterAll(async () => {
		await fs.rm(tempHome, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	describe("1. Cosine Similarity Mathematics", () => {
		it("should score identical vectors as 1.0", () => {
			const a = [1, 2, 3];
			const b = [1, 2, 3];
			expect(memoryModule.cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
		});

		it("should score orthogonal vectors as 0.0", () => {
			const a = [1, 0, 0];
			const b = [0, 1, 0];
			expect(memoryModule.cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
		});

		it("should score opposite vectors as -1.0", () => {
			const a = [1, 0];
			const b = [-1, 0];
			expect(memoryModule.cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
		});

		it("should handle empty or mismatched dimensions gracefully returning 0", () => {
			expect(memoryModule.cosineSimilarity([], [])).toBe(0);
			expect(memoryModule.cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
		});
	});

	describe("2. MemoryManager LocalFileStore Integration & Semantic Search", () => {
		it("should write and retrieve facts successfully with mock embeddings", async () => {
			const manager = memoryModule.MemoryManager.getInstance(mockConfig);
			await manager.init();

			// Mock embedding generation to be successful
			const mockEmbeddings: EmbeddingsLike = {
				embedQuery: vi.fn(async (text: string) => {
					if (text.includes("dark mode")) return [1, 0, 0];
					if (text.includes("typescript")) return [0, 1, 0];
					return [0, 0, 1];
				}),
			};
			vi.spyOn(memoryModule.EmbeddingsFactory, "create").mockReturnValue(
				mockEmbeddings,
			);

			// Save facts
			await manager.saveFact("User prefers dark mode in editors");
			await manager.saveFact("User likes typescript coding");

			// Query semantic memories
			const results = await manager.searchFacts("dark mode preferences", 5);
			expect(results.length).toBeGreaterThan(0);
			expect(results[0].content).toContain("dark mode");
			expect(results[0].similarity).toBeGreaterThan(0.9);
		});

		it("should fall back gracefully to keyword matching if embedding server is offline", async () => {
			const manager = memoryModule.MemoryManager.getInstance(mockConfig);
			await manager.init();

			// Mock embedding generation to fail (offline error fallback)
			const mockEmbeddings: EmbeddingsLike = {
				embedQuery: vi.fn().mockRejectedValue(new Error("Connection refused")),
			};
			vi.spyOn(memoryModule.EmbeddingsFactory, "create").mockReturnValue(
				mockEmbeddings,
			);

			// Save facts (embeddings will fail, falling back to empty arrays)
			await manager.saveFact("User prefers dark mode in editors");
			await manager.saveFact("User likes typescript coding");

			// Search query (embedding fails, falls back to keyword matching)
			const results = await manager.searchFacts("editors dark mode", 5);
			expect(results.length).toBeGreaterThan(0);
			expect(results[0].content).toContain("dark mode");
			// Keyword fallback mapped similarity score >= 0.6
			expect(results[0].similarity).toBeGreaterThanOrEqual(0.6);
		});
	});

	describe("3. User Profile State Management", () => {
		it("should return empty default profile if none exists", async () => {
			const manager = memoryModule.MemoryManager.getInstance(mockConfig);
			const profile = await manager.getProfile();
			expect(profile.traits).toEqual([]);
			expect(profile.activeGoals).toEqual([]);
		});

		it("should save and reload user profile states successfully", async () => {
			const manager = memoryModule.MemoryManager.getInstance(mockConfig);
			const testProfile = {
				username: "Bob",
				timezone: "America/New_York",
				traits: ["Prefers typescript", "Likes unit tests"],
				activeGoals: ["Implement offline memory"],
			};

			await manager.saveProfile(testProfile);
			const profile = await manager.getProfile();
			expect(profile).toEqual(testProfile);
		});
	});

	describe("4. Sandboxed Memory Tools", () => {
		it("should invoke remember and recall tools successfully", async () => {
			const manager = memoryModule.MemoryManager.getInstance(mockConfig);
			await manager.init();

			const mockEmbeddings: EmbeddingsLike = {
				embedQuery: vi.fn(async (text: string) => {
					if (text.includes("dark mode")) return [1, 0, 0];
					return [0, 0, 1];
				}),
			};
			vi.spyOn(memoryModule.EmbeddingsFactory, "create").mockReturnValue(
				mockEmbeddings,
			);

			const rememberTool = createRememberTool(mockConfig);
			const recallTool = createRecallTool(mockConfig);

			// Invoke remember tool
			const remRes = await rememberTool.invoke({
				content: "User loves dark mode",
			});
			expect(remRes).toContain("Successfully remembered");

			// Invoke recall tool
			const recRes = await recallTool.invoke({ query: "dark mode query" });
			expect(recRes).toContain("loves dark mode");
		});

		it("should return no memories when embeddings are low similarity despite a saved fact", async () => {
			const manager = memoryModule.MemoryManager.getInstance(mockConfig);
			await manager.init();

			const mockEmbeddings: EmbeddingsLike = {
				embedQuery: vi.fn(async (text: string) => {
					if (text.includes("user's name")) return [1, 0];
					return [0, 1];
				}),
			};
			vi.spyOn(memoryModule.EmbeddingsFactory, "create").mockReturnValue(
				mockEmbeddings,
			);

			const rememberTool = createRememberTool(mockConfig);
			const recallTool = createRecallTool(mockConfig);

			await rememberTool.invoke({
				content: "User's name is Ada Lovelace.",
			});

			const recRes = await recallTool.invoke({
				query: "user's name",
				limit: 1,
			});
			expect(recRes).toBe("No relevant memories found.");
		});

		it("should return similarity 1.0 for identical saved and queried content", async () => {
			const manager = memoryModule.MemoryManager.getInstance(mockConfig);
			await manager.init();

			const exactContent =
				"The user's name is Phat and their timezone is UTC+7.";

			const mockEmbeddings: EmbeddingsLike = {
				embedQuery: vi.fn(async (text: string) => {
					if (text === exactContent) return [1, 0, 0];
					return [0, 0, 1];
				}),
			};
			vi.spyOn(memoryModule.EmbeddingsFactory, "create").mockReturnValue(
				mockEmbeddings,
			);

			const rememberTool = createRememberTool(mockConfig);
			const recallTool = createRecallTool(mockConfig);

			await rememberTool.invoke({ content: exactContent });

			const recRes = await recallTool.invoke({
				query: exactContent,
				limit: 1,
			});
			expect(recRes).toContain("Similarity: 1.00");
			expect(recRes).toContain(exactContent);
		});
	});
});
