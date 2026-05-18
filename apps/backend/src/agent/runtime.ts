import { randomUUID } from "node:crypto";

import { buildMiniclawSystemPrompt } from "@miniclaw/prompts";
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import type { ConfigStore } from "../config/loader.js";
import { AgentRepository } from "./repository.js";
import {
  createAgentProvider,
  ProviderConfigurationError,
  type ChatModelLike,
  type ResolvedAgentProvider,
} from "./provider.js";
import type { AgentMessage } from "./types.js";

export type AgentRuntime = {
  run(input: { input: string; sessionId?: string }): Promise<{ runId: string; sessionId: string }>;
  listRuns(): ReturnType<AgentRepository["listRuns"]>;
  getRun(runId: string): ReturnType<AgentRepository["getRun"]>;
  listRunEvents(runId: string): ReturnType<AgentRepository["listRunEvents"]>;
};

export type AgentProviderFactory = (
  config: Awaited<ReturnType<ConfigStore["load"]>>,
) => ResolvedAgentProvider;

export type AgentRuntimeOptions = {
  configStore: ConfigStore;
  repository: AgentRepository;
  providerFactory?: AgentProviderFactory;
};

const AgentState = Annotation.Root({
  input: Annotation<string>(),
  sessionId: Annotation<string>(),
  runId: Annotation<string>(),
  history: Annotation<AgentMessage[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  systemPrompt: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  response: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  providerKey: Annotation<string | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  model: Annotation<string | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
});

type AgentGraphState = typeof AgentState.State;

export function createAgentRuntime(options: AgentRuntimeOptions): AgentRuntime {
  const providerFactory = options.providerFactory ?? createAgentProvider;
  const graph = createRuntimeGraph(options, providerFactory);

  return {
    async run(input) {
      const runId = randomUUID();
      const sessionId = input.sessionId?.trim() || randomUUID();
      const startedAt = new Date().toISOString();

      options.repository.createSession(sessionId, startedAt);
      options.repository.createRun({
        id: runId,
        sessionId,
        status: "running",
        input: input.input,
        providerKey: null,
        model: null,
        startedAt,
        metadata: { channel: "debug" },
      });
      appendEvent(options.repository, runId, "run.started", "Agent run started.", {
        sessionId,
      });

      try {
        await graph.invoke({
          input: input.input,
          sessionId,
          runId,
        });
      } catch (error) {
        const message = toErrorMessage(error);
        const type =
          error instanceof ProviderConfigurationError ? "provider_unavailable" : "run.failed";

        appendEvent(options.repository, runId, type, message);
        options.repository.completeRun({
          id: runId,
          status: "failed",
          finalResponse: null,
          error: message,
          providerKey: null,
          model: null,
          completedAt: new Date().toISOString(),
          metadata: { channel: "debug", errorType: type },
        });
      }

      return { runId, sessionId };
    },
    listRuns() {
      return options.repository.listRuns();
    },
    getRun(runId) {
      return options.repository.getRun(runId);
    },
    listRunEvents(runId) {
      return options.repository.listRunEvents(runId);
    },
  };
}

function createRuntimeGraph(options: AgentRuntimeOptions, providerFactory: AgentProviderFactory) {
  async function loadContext(state: AgentGraphState) {
    const history = options.repository.listSessionMessages(state.sessionId);
    appendEvent(options.repository, state.runId, "loadContext", "Loaded session context.", {
      messageCount: history.length,
    });

    return { history };
  }

  async function buildPrompt(state: AgentGraphState) {
    const systemPrompt = buildMiniclawSystemPrompt({
      channel: "debug",
      now: new Date().toISOString(),
      recentMessages: state.history.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    });

    appendEvent(options.repository, state.runId, "buildPrompt", "Built runtime prompt.", {
      promptChars: systemPrompt.length,
    });

    return { systemPrompt };
  }

  async function invokeModel(state: AgentGraphState) {
    const config = await options.configStore.load();
    const provider = providerFactory(config);

    appendEvent(options.repository, state.runId, "invokeModel", "Invoking configured LLM.", {
      providerKey: provider.providerKey,
      model: provider.model,
    });

    const response = await invokeChatModel(provider.chatModel, state.systemPrompt, state.input);

    appendEvent(
      options.repository,
      state.runId,
      "invokeModel.completed",
      "LLM response received.",
      {
        responseChars: response.length,
      },
    );

    return {
      response,
      providerKey: provider.providerKey,
      model: provider.model,
    };
  }

  async function persistMessages(state: AgentGraphState) {
    const createdAt = new Date().toISOString();
    options.repository.appendMessage({
      id: randomUUID(),
      sessionId: state.sessionId,
      role: "user",
      content: state.input,
      createdAt,
    });
    options.repository.appendMessage({
      id: randomUUID(),
      sessionId: state.sessionId,
      role: "assistant",
      content: state.response,
      createdAt: new Date().toISOString(),
    });

    appendEvent(options.repository, state.runId, "persistMessages", "Persisted session messages.");

    return {};
  }

  async function completeRun(state: AgentGraphState) {
    options.repository.completeRun({
      id: state.runId,
      status: "completed",
      finalResponse: state.response,
      error: null,
      providerKey: state.providerKey,
      model: state.model,
      completedAt: new Date().toISOString(),
      metadata: { channel: "debug" },
    });

    appendEvent(options.repository, state.runId, "completeRun", "Agent run completed.");

    return {};
  }

  return new StateGraph(AgentState)
    .addNode("loadContext", loadContext)
    .addNode("buildPrompt", buildPrompt)
    .addNode("invokeModel", invokeModel)
    .addNode("persistMessages", persistMessages)
    .addNode("completeRun", completeRun)
    .addEdge(START, "loadContext")
    .addEdge("loadContext", "buildPrompt")
    .addEdge("buildPrompt", "invokeModel")
    .addEdge("invokeModel", "persistMessages")
    .addEdge("persistMessages", "completeRun")
    .addEdge("completeRun", END)
    .compile();
}

async function invokeChatModel(
  model: ChatModelLike,
  systemPrompt: string,
  input: string,
): Promise<string> {
  const result = await model.invoke([new SystemMessage(systemPrompt), new HumanMessage(input)]);
  return messageContentToText(result);
}

function messageContentToText(message: BaseMessage): string {
  if (typeof message.content === "string") return message.content;

  return message.content
    .map((part) => {
      if (typeof part === "string") return part;
      if ("text" in part && typeof part.text === "string") return part.text;
      return "";
    })
    .join("")
    .trim();
}

function appendEvent(
  repository: AgentRepository,
  runId: string,
  type: string,
  message: string,
  payload?: Record<string, unknown>,
): void {
  repository.appendEvent({
    id: randomUUID(),
    runId,
    createdAt: new Date().toISOString(),
    type,
    message,
    payload,
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Agent run failed with an unknown error.";
}

export function createFakeChatModel(response: string): ChatModelLike {
  return {
    async invoke() {
      return new AIMessage(response);
    },
  };
}
