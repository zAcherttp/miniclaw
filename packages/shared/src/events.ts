export type AgentEvent =
  | { type: "run.started"; runId: string }
  | { type: "node.started"; node: string }
  | { type: "text.delta"; text: string }
  | { type: "tool.started"; tool: string; input: unknown }
  | { type: "tool.completed"; tool: string; result: unknown }
  | { type: "approval.requested"; approvalId: string; summary: string }
  | { type: "approval.resolved"; approvalId: string; approved: boolean }
  | { type: "run.completed"; runId: string }
  | { type: "run.failed"; runId: string; error: string };

export type AppEvent = {
  id: string;
  createdAt: string;
  type: string;
  payload: unknown;
};
