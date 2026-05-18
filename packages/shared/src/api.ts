import type { MiniclawConfig } from "./config.js";

export type HealthResponse = {
  ok: true;
  name: "miniclaw-backend";
  version: string;
};

export type ConfigResponse = {
  config: MiniclawConfig;
  meta: {
    path: string;
    secretsRedacted: true;
  };
};

export type UpdateConfigRequest = {
  config: Partial<MiniclawConfig>;
};

export type SystemPathsResponse = {
  home: string;
  configPath: string;
  databasePath: string;
  logsPath: string;
};

export type AgentRunStatus = "running" | "completed" | "failed";

export type AgentRunSummary = {
  id: string;
  sessionId: string;
  status: AgentRunStatus;
  input: string;
  finalResponse: string | null;
  error: string | null;
  providerKey: string | null;
  model: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type AgentRunDetail = AgentRunSummary & {
  metadata: Record<string, unknown>;
};

export type AgentRunEventRecord = {
  id: string;
  runId: string;
  createdAt: string;
  type: string;
  message: string;
  payload: Record<string, unknown>;
};

export type CreateAgentRunRequest = {
  input: string;
  sessionId?: string;
};

export type CreateAgentRunResponse = {
  runId: string;
  sessionId: string;
};

export type ListAgentRunsResponse = {
  runs: AgentRunSummary[];
};

export type GetAgentRunResponse = {
  run: AgentRunDetail;
};

export type ListAgentRunEventsResponse = {
  events: AgentRunEventRecord[];
};
