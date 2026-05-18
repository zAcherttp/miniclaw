import type {
  AgentRunDetail,
  AgentRunEventRecord,
  AgentRunStatus,
  AgentRunSummary,
} from "@miniclaw/shared";

export type AgentMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type AgentRunRecord = AgentRunDetail;
export type AgentRunListItem = AgentRunSummary;
export type AgentEventRecord = AgentRunEventRecord;

export type CreateRunInput = {
  id: string;
  sessionId: string;
  status: AgentRunStatus;
  input: string;
  providerKey: string | null;
  model: string | null;
  startedAt: string;
  metadata?: Record<string, unknown>;
};

export type CreateEventInput = {
  id: string;
  runId: string;
  createdAt: string;
  type: string;
  message: string;
  payload?: Record<string, unknown>;
};

export type CreateMessageInput = {
  id: string;
  sessionId: string;
  role: AgentMessage["role"];
  content: string;
  createdAt: string;
};

export type CompleteRunInput = {
  id: string;
  status: AgentRunStatus;
  finalResponse: string | null;
  error: string | null;
  providerKey: string | null;
  model: string | null;
  completedAt: string;
  metadata?: Record<string, unknown>;
};
