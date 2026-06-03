import crypto from "node:crypto";
import path from "node:path";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { OllamaEmbeddings } from "@langchain/ollama";
import { OpenAIEmbeddings } from "@langchain/openai";
import { LocalFileStore } from "langchain/storage/file_system";
import { getAppDir } from "@/config/paths";
import type { AppConfig } from "@/config/schema";
import { todayISODate } from "@/utils/date";
import { logger } from "@/utils/logger";

export interface FactMemory {
	content: string;
	embedding: number[];
	timestamp: number;
}

export interface UserProfile {
	username?: string;
	timezone?: string;
	traits: string[];
	activeGoals: string[];
}

export interface EmbeddingsLike {
	embedQuery(text: string): Promise<number[]>;
	model?: string;
	modelName?: string;
}

/**
 * A single result entry from a semantic or keyword fact search.
 */
export interface FactSearchResult {
	key: string;
	content: string;
	similarity: number;
}

/**
 * Optimized offline Cosine Similarity algorithm.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;
	let dotProduct = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	if (normA === 0 || normB === 0) return 0;
	return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Initializes the appropriate Embeddings model matching the active LLM provider,
 * falling back to Ollama nomic-embed-text-v2-moe:latest as default.
 */
export const EmbeddingsFactory = {
	create(config: AppConfig): EmbeddingsLike {
		const modelString = config.agent.model;
		let provider: string | undefined;
		const colonIndex = modelString.indexOf(":");
		if (colonIndex > 0) {
			provider = modelString.substring(0, colonIndex);
		}

		if (provider === "google-genai") {
			return new GoogleGenerativeAIEmbeddings({
				apiKey: process.env.GOOGLE_API_KEY,
				modelName: "text-embedding-004",
			});
		} else if (provider === "openai") {
			return new OpenAIEmbeddings({
				apiKey: process.env.OPENAI_API_KEY || process.env.OLLAMA_API_KEY,
				modelName: "text-embedding-3-small",
				configuration: process.env.OPENAI_API_BASE
					? { baseURL: process.env.OPENAI_API_BASE }
					: undefined,
			});
		} else {
			// Default: Ollama nomic-embed-text-v2-moe:latest (768 dimensions)
			return new OllamaEmbeddings({
				baseUrl: process.env.OLLAMA_API_URL || "http://127.0.0.1:11434",
				model: "nomic-embed-text-v2-moe:latest",
			});
		}
	},
};

/**
 * Helper to process and truncate texts before embedding.
 */
async function embedText(
	embeddings: EmbeddingsLike,
	text: string,
): Promise<number[] | null> {
	// Truncate to maximum input length (roughly 2048 chars for 512 tokens)
	const processed = text.slice(0, 2048);

	try {
		return await embeddings.embedQuery(processed);
	} catch (err) {
		logger.error(
			err,
			`[Embeddings] Failed to generate embedding vector for: ${processed.slice(0, 40)}...`,
		);
		return null;
	}
}

/**
 * Singleton MemoryManager powered by LocalFileStore.
 * Handles user profiles, semantic memories, and daily traits profiling.
 */
export class MemoryManager {
	private static instance: MemoryManager | null = null;
	private store: LocalFileStore | null = null;
	private config: AppConfig;
	private encoder = new TextEncoder();
	private decoder = new TextDecoder();

	private constructor(config: AppConfig) {
		this.config = config;
	}

	public static getInstance(config: AppConfig): MemoryManager {
		if (!MemoryManager.instance) {
			MemoryManager.instance = new MemoryManager(config);
		}
		return MemoryManager.instance;
	}

	/**
	 * Explicitly resets the singleton instance (primarily for testing purposes)
	 */
	public static resetInstance(): void {
		MemoryManager.instance = null;
	}

	public async init(): Promise<void> {
		if (this.store) return;
		const memoryStoreDir = path.join(getAppDir(), "memory_store");
		try {
			this.store = await LocalFileStore.fromPath(memoryStoreDir);
			logger.info(
				`[MemoryManager] LocalFileStore initialized successfully at ${memoryStoreDir}`,
			);
		} catch (err) {
			logger.error(err, "[MemoryManager] Failed to initialize LocalFileStore");
		}
	}

	private async get<T>(key: string): Promise<T | null> {
		if (!this.store) await this.init();
		try {
			const res = await this.store?.mget([key]);
			if (res?.[0]) {
				const raw = this.decoder.decode(res[0]);
				return JSON.parse(raw) as T;
			}
		} catch (err) {
			logger.error(err, `[MemoryManager] Failed to get key ${key}`);
		}
		return null;
	}

	private async set(key: string, value: unknown): Promise<void> {
		if (!this.store) await this.init();
		try {
			const serialized = JSON.stringify(value);
			await this.store?.mset([[key, this.encoder.encode(serialized)]]);
		} catch (err) {
			logger.error(err, `[MemoryManager] Failed to set key ${key}`);
		}
	}

	public async delete(key: string): Promise<void> {
		if (!this.store) await this.init();
		try {
			await this.store?.mdelete([key]);
		} catch (err) {
			logger.error(err, `[MemoryManager] Failed to delete key ${key}`);
		}
	}

	/**
	 * Saves a single fact to the semantic store. Generates embedding gracefully.
	 */
	public async saveFact(
		content: string,
		key?: string | null,
	): Promise<string | null> {
		try {
			const embeddings = EmbeddingsFactory.create(this.config);
			const embedding = await embedText(embeddings, content);

			const factKey = key || `fact_${crypto.randomUUID()}`;
			const factData: FactMemory = {
				content,
				embedding: embedding || [], // Graceful fallback to empty array if offline
				timestamp: Date.now(),
			};

			await this.set(factKey, factData);

			if (!embedding) {
				logger.warn(
					`[MemoryManager] Fact saved but embedding generation failed. Preserving text for keyword fallback query.`,
				);
			} else {
				logger.info(`[MemoryManager] Fact saved successfully with embedding.`);
			}
			return factKey;
		} catch (err) {
			logger.error(err, "[MemoryManager] Error saving fact");
			return null;
		}
	}

	/**
	 * Queries semantic memories. Cosine Similarity search with keyword fallback.
	 */
	public async searchFacts(
		query: string,
		limit = 5,
	): Promise<FactSearchResult[]> {
		if (!this.store) await this.init();
		if (!this.store) return [];
		const store = this.store;
		try {
			const embeddings = EmbeddingsFactory.create(this.config);
			const queryEmbedding = await embedText(embeddings, query);

			if (!queryEmbedding) {
				logger.warn(
					`[MemoryManager] Embedding invocation failed. Switching to offline keyword fallback search.`,
				);
				return await this.searchFactsKeywordFallback(query, limit);
			}

			const matched: FactSearchResult[] = [];

			for await (const key of store.yieldKeys("fact_")) {
				const fact = await this.get<FactMemory>(key);
				if (fact?.embedding && fact.embedding.length > 0) {
					const sim = cosineSimilarity(queryEmbedding, fact.embedding);
					matched.push({
						key,
						content: fact.content,
						similarity: sim,
					});
				} else if (fact?.content) {
					// Fallback keyword scoring inside vector search if some documents missed embeddings
					const sim = this.keywordScore(query, fact.content);
					if (sim >= 0.4) {
						matched.push({
							key,
							content: fact.content,
							similarity: sim,
						});
					}
				}
			}

			return matched
				.filter((m) => m.similarity >= 0.4)
				.sort((a, b) => b.similarity - a.similarity)
				.slice(0, limit);
		} catch (err) {
			logger.error(err, "[MemoryManager] Error searching facts");
			return [];
		}
	}

	/**
	 * Evaluates basic keyword matching score for offline resilience.
	 */
	private keywordScore(query: string, content: string): number {
		const qWords = query
			.toLowerCase()
			.split(/\s+/)
			.filter((w) => w.length > 2);
		if (qWords.length === 0) return 0;
		const lowerContent = content.toLowerCase();
		let hits = 0;
		for (const w of qWords) {
			if (lowerContent.includes(w)) hits += 1;
		}
		if (hits === 0) return 0;
		return 0.6 + (hits / qWords.length) * 0.35;
	}

	private async searchFactsKeywordFallback(
		query: string,
		limit: number,
	): Promise<FactSearchResult[]> {
		if (!this.store) await this.init();
		if (!this.store) return [];
		const store = this.store;
		const matched: FactSearchResult[] = [];
		for await (const key of store.yieldKeys("fact_")) {
			const fact = await this.get<FactMemory>(key);
			if (fact?.content) {
				const sim = this.keywordScore(query, fact.content);
				if (sim >= 0.4) {
					matched.push({
						key,
						content: fact.content,
						similarity: sim,
					});
				}
			}
		}
		return matched.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
	}

	/**
	 * Returns current cached UserProfile state.
	 */
	public async getProfile(): Promise<UserProfile> {
		const profile = await this.get<UserProfile>("profile_state");
		return profile || { traits: [], activeGoals: [] };
	}

	/**
	 * Formats the user profile data into a clean, markdown prompt block.
	 */
	public async generatePromptBlock(): Promise<string> {
		const profile = await this.getProfile();
		const profileDetails: string[] = [];

		if (profile.username) {
			profileDetails.push(`- Username: ${profile.username}`);
		}
		if (profile.timezone) {
			profileDetails.push(`- User Timezone: ${profile.timezone}`);
		}
		if (profile.traits && profile.traits.length > 0) {
			profileDetails.push(
				`- User Traits & Preferences:\n${profile.traits.map((t) => `  - ${t}`).join("\n")}`,
			);
		}
		if (profile.activeGoals && profile.activeGoals.length > 0) {
			profileDetails.push(
				`- User Long-Term Goals (Academic, Career, Projects, or Life Goals):\n${profile.activeGoals.map((g) => `  - ${g}`).join("\n")}`,
			);
		}

		if (profileDetails.length > 0) {
			return `## USER INFO:\n${profileDetails.join("\n")}`;
		}
		return "";
	}

	/**
	 * Saves a UserProfile state to the store.
	 */
	public async saveProfile(profile: UserProfile): Promise<void> {
		await this.set("profile_state", profile);
	}

	/**
	 * Updates the profile state and records the daily summarization timestamp.
	 */
	public async updateProfileAndTimestamp(profile: UserProfile): Promise<void> {
		await this.saveProfile(profile);
		await this.set("meta_last_summarization_date", todayISODate());
	}
}
