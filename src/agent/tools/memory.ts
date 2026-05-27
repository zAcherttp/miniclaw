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
			"Saves a concise fact, preference, observation, or piece of information to your long-term memory store so you can recall it in future conversations.",
		schema: z.object({
			content: z
				.string()
				.describe(
					"The main fact, preference, observation or information to remember",
				),
		}),
		func: async ({ content }) => {
			try {
				const embeddings: EmbeddingsLike = EmbeddingsFactory.create(config);
				const modelName = embeddings.model || embeddings.modelName || "unknown";
				logger.info(`[AgentTool:remember] Using embedding model: ${modelName}`);

				const manager = MemoryManager.getInstance(config);
				const success = await manager.saveFact(content);
				if (success) {
					return `Successfully remembered: "${content}"`;
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
			"Searches your long-term memories by semantic context similarity to retrieve relevant facts, preferences, or goals.",
		schema: z.object({
			query: z
				.string()
				.describe("The search term or concept to recall from memory"),
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
							`${idx + 1}. [Similarity: ${r.similarity.toFixed(2)}] ${r.content}`,
					)
					.join("\n");
				return `Matched memories:\n${formatted}`;
			} catch (err: unknown) {
				return `Error recalling memories: ${(err as Error).message}`;
			}
		},
	});
};
