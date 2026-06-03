import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AppConfig } from "@/config/schema";
import { logger } from "@/utils/logger";
import {
	EmbeddingsFactory,
	type EmbeddingsLike,
	MemoryManager,
} from "../memory";

/**
 * Creates the "remember" tool to save structured facts to the offline store.
 */
export const createRememberTool = (config: AppConfig) => {
	return new DynamicStructuredTool({
		name: "remember",
		description:
			"Saves a concise fact, preference, observation, or piece of information to your long-term memory store. ALWAYS recall first before calling remember to check if a related fact already exists. If a match is found, reuse its key to overwrite/update the existing fact rather than creating a duplicate. If no match is found, omit or pass null for the key.",
		schema: z.object({
			key: z
				.string()
				.nullable()
				.optional()
				.describe(
					"The reference key of the existing fact to update (retrieve this using the recall tool first). Pass null or omit to insert a new fact.",
				),
			content: z
				.string()
				.describe(
					"The concise fact, preference, observation or information to remember.",
				),
		}),
		func: async ({ key, content }) => {
			try {
				const embeddings: EmbeddingsLike = EmbeddingsFactory.create(config);
				const modelName = embeddings.model || embeddings.modelName || "unknown";
				logger.info(`[AgentTool:remember] Using embedding model: ${modelName}`);

				const manager = MemoryManager.getInstance(config);
				const savedKey = await manager.saveFact(content, key);
				if (savedKey) {
					return `Successfully remembered fact with key "${savedKey}": "${content}"`;
				}
				return "Error: Failed to save fact to memory store.";
			} catch (err: unknown) {
				return `Error saving memory: ${(err as Error).message}`;
			}
		},
	});
};

/**
 * Creates the "recall" tool to search long-term memories using Cosine Similarity or keyword fallback.
 */
export const createRecallTool = (config: AppConfig) => {
	return new DynamicStructuredTool({
		name: "recall",
		description:
			"Searches your long-term memories by semantic context similarity to retrieve relevant facts, preferences, or goals. Call this first before responding when the answer plausibly depends on prior context, or before saving/updating a memory using remember.",
		schema: z.object({
			query: z
				.string()
				.describe(
					"The search term or concept to recall from memory. Be specific to find relevant facts.",
				),
			limit: z
				.number()
				.optional()
				.default(5)
				.describe("Maximum number of memories to return"),
		}),
		func: async ({ query, limit }) => {
			try {
				const manager = MemoryManager.getInstance(config);
				const results = await manager.searchFacts(query, limit);
				if (results.length === 0) {
					return "No relevant memories found.";
				}
				const formatted = results
					.map(
						(r, idx) =>
							`${idx + 1}. [Key: ${r.key}] [Similarity: ${r.similarity.toFixed(2)}] ${r.content}`,
					)
					.join("\n");
				return `Matched memories:\n${formatted}`;
			} catch (err: unknown) {
				return `Error recalling memories: ${(err as Error).message}`;
			}
		},
	});
};
