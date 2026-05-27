import crypto from "node:crypto";
import path from "node:path";
import { type BaseMessage, SystemMessage } from "@langchain/core/messages";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { OllamaEmbeddings } from "@langchain/ollama";
import { OpenAIEmbeddings } from "@langchain/openai";
import { LocalFileStore } from "langchain/storage/file_system";
import { getAppDir } from "@/config/paths";
import type { AppConfig } from "@/config/schema";
import { logger } from "@/utils/logger";
import { createChatModel } from "./models";

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
	public async saveFact(content: string): Promise<boolean> {
		try {
			const embeddings = EmbeddingsFactory.create(this.config);
			const embedding = await embedText(embeddings, content);

			const factId = crypto.randomUUID();
			const factKey = `fact_${factId}`;
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
			return true;
		} catch (err) {
			logger.error(err, "[MemoryManager] Error saving fact");
			return false;
		}
	}

	/**
	 * Queries semantic memories. Cosine Similarity search with keyword fallback.
	 */
	public async searchFacts(
		query: string,
		limit = 5,
	): Promise<Array<{ content: string; similarity: number }>> {
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

			const matched: Array<{ content: string; similarity: number }> = [];

			for await (const key of store.yieldKeys("fact_")) {
				const fact = await this.get<FactMemory>(key);
				if (fact?.embedding && fact.embedding.length > 0) {
					const sim = cosineSimilarity(queryEmbedding, fact.embedding);
					matched.push({
						content: fact.content,
						similarity: sim,
					});
				} else if (fact?.content) {
					// Fallback keyword scoring inside vector search if some documents missed embeddings
					const sim = this.keywordScore(query, fact.content);
					if (sim >= 0.4) {
						matched.push({
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
	): Promise<Array<{ content: string; similarity: number }>> {
		if (!this.store) await this.init();
		if (!this.store) return [];
		const store = this.store;
		const matched: Array<{ content: string; similarity: number }> = [];
		for await (const key of store.yieldKeys("fact_")) {
			const fact = await this.get<FactMemory>(key);
			if (fact?.content) {
				const sim = this.keywordScore(query, fact.content);
				if (sim >= 0.4) {
					matched.push({
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
	 * Saves a UserProfile state to the store.
	 */
	public async saveProfile(profile: UserProfile): Promise<void> {
		await this.set("profile_state", profile);
	}

	/**
	 * Daily Session Auto-summarizer job. Extracts preferences, traits, and goals.
	 */
	public async runDailySummarization(messages: BaseMessage[]): Promise<void> {
		if (messages.length === 0) return;
		try {
			logger.info(`[MemoryManager] Running daily auto-summarization job...`);
			const model = await createChatModel(this.config);
			const currentProfile = await this.getProfile();

			const formattedHistory = messages
				.map(
					(m) =>
						`${m.type.toUpperCase()}: ${
							typeof m.content === "string"
								? m.content
								: JSON.stringify(m.content)
						}`,
				)
				.join("\n");

			const prompt = `You are the memory and profiling engine for Miniclaw, an advanced personal assistant.
Your task is to analyze the conversation history and refine the user's profile state.

Current User Profile State:
- Traits: ${JSON.stringify(currentProfile.traits)}
- Active Goals: ${JSON.stringify(currentProfile.activeGoals)}
- Username: ${currentProfile.username || "Unknown"}
- Timezone: ${currentProfile.timezone || "Unknown"}

Conversation History:
${formattedHistory}

Instructions:
1. Extract any new user traits, preferences, rules, or permanent observations. Keep traits concise (e.g. "Prefers TypeScript for development", "Uses dark mode").
2. Update the list of active user goals or pending schedules mentioned (e.g. "Create secure execute tool", "Manage calendar"). Mark completed goals as done by removing them, and add new ones.
3. Identify if the user's name or timezone was explicitly mentioned or can be inferred (e.g. "I'm in Tokyo now" -> "Asia/Tokyo").
4. Return your analysis strictly as a valid JSON object in the following format:
{
  "username": "string or null",
  "timezone": "string or null",
  "traits": ["string", "string", ...],
  "activeGoals": ["string", "string", ...]
}
Do NOT wrap the JSON in markdown blocks or include any other conversational preamble. Return ONLY the raw JSON string.`;

			const response = await model.invoke([new SystemMessage(prompt)]);
			let content =
				typeof response.content === "string" ? response.content.trim() : "";

			// Clean markdown wrapper if model accidentally included it
			if (content.startsWith("```json")) {
				content = content.substring(7);
			}
			if (content.endsWith("```")) {
				content = content.substring(0, content.length - 3);
			}
			content = content.trim();

			const updatedProfile = JSON.parse(content) as UserProfile;
			if (
				updatedProfile &&
				Array.isArray(updatedProfile.traits) &&
				Array.isArray(updatedProfile.activeGoals)
			) {
				await this.saveProfile(updatedProfile);

				// Set meta stamp
				const todayStr = new Date().toISOString().split("T")[0];
				await this.set("meta_last_summarization_date", todayStr);

				logger.info(
					`[MemoryManager] Daily auto-summarization completed successfully. Profile updated: ${JSON.stringify(
						updatedProfile,
					)}`,
				);
			}
		} catch (err) {
			logger.error(
				err,
				`[MemoryManager] Failed to run daily auto-summarization`,
			);
		}
	}

	/**
	 * Checks if daily summarization has run today. If not, triggers it.
	 */
	public async runDailyCronIfNeeded(messages: BaseMessage[]): Promise<void> {
		try {
			await this.init();
			const todayStr = new Date().toISOString().split("T")[0];
			const lastRunDate = await this.get<string>(
				"meta_last_summarization_date",
			);

			if (lastRunDate !== todayStr) {
				await this.runDailySummarization(messages);
			}
		} catch (err) {
			logger.error(err, "[MemoryManager] Error in runDailyCronIfNeeded");
		}
	}
}
