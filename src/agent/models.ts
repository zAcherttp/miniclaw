import { initChatModel } from "langchain/chat_models/universal";
import type { AppConfig } from "@/config/schema";

/**
 * Creates the appropriate LangChain ChatModel instance based on the configuration model string.
 * Parses prefixes like "ollama:", "openai:", utilizing LangChain's universal initChatModel.
 *
 * @param config The application configuration
 * @returns An initialized LangChain ChatModel instance
 */
export async function createChatModel(config: AppConfig) {
	const modelString = config.agent.model;
	const temperature = config.agent.temperature;

	// Detect provider prefix if exists
	let provider: string | undefined;
	const colonIndex = modelString.indexOf(":");
	if (colonIndex > 0) {
		provider = modelString.substring(0, colonIndex);
	}

	const options: Record<string, unknown> = {
		temperature,
	};

	if (config.agent.reasoning_effort) {
		options.reasoningEffort = config.agent.reasoning_effort;
	}

	if (provider === "ollama") {
		options.baseUrl = process.env.OLLAMA_API_URL || "http://127.0.0.1:11434";
	} else if (provider === "openai") {
		options.apiKey = process.env.OPENAI_API_KEY || process.env.OLLAMA_API_KEY;
		if (process.env.OPENAI_API_BASE) {
			options.configuration = {
				baseURL: process.env.OPENAI_API_BASE,
			};
		}
	} else if (provider === "google-genai") {
		options.apiKey = process.env.GOOGLE_API_KEY;
	}

	return await initChatModel(modelString, options);
}
