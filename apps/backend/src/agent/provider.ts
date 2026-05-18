import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";

import { isEnvReference, type MiniclawConfig, type ProviderItemConfig } from "@miniclaw/shared";
import type { BaseMessage } from "@langchain/core/messages";

export type ChatModelLike = {
  invoke(messages: BaseMessage[]): Promise<BaseMessage>;
};

export type ResolvedAgentProvider = {
  providerKey: string;
  model: string;
  chatModel: ChatModelLike;
};

export class ProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigurationError";
  }
}

export function createAgentProvider(config: MiniclawConfig): ResolvedAgentProvider {
  const providerKey = config.providers.activeProvider;

  if (!providerKey) {
    throw new ProviderConfigurationError("No active LLM provider is configured.");
  }

  const provider = config.providers.items[providerKey];
  if (!provider) {
    throw new ProviderConfigurationError(`Active LLM provider '${providerKey}' is missing.`);
  }

  if (!provider.model) {
    throw new ProviderConfigurationError(
      `Active LLM provider '${providerKey}' must configure a model before agent runs can start.`,
    );
  }

  const chatModel = createChatModel(provider);

  return {
    providerKey,
    model: provider.model,
    chatModel,
  };
}

function createChatModel(provider: ProviderItemConfig): ChatModelLike {
  if (provider.kind === "ollama") {
    return new ChatOllama({
      model: provider.model ?? "",
      baseUrl: provider.baseUrl ?? "http://127.0.0.1:11434",
    });
  }

  return new ChatOpenAI({
    apiKey: resolveSecret(provider.apiKey),
    model: provider.model ?? "",
    configuration: provider.baseUrl ? { baseURL: provider.baseUrl } : undefined,
  });
}

export function resolveSecret(value: string | null): string | undefined {
  if (!value) return undefined;

  if (!isEnvReference(value)) return value;

  const envName = value.slice(2, -1);
  const resolved = process.env[envName];

  if (!resolved) {
    throw new ProviderConfigurationError(`Environment variable '${envName}' is not set.`);
  }

  return resolved;
}
