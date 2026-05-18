import { Hono } from "hono";

import type {
  CreateAgentRunRequest,
  CreateAgentRunResponse,
  GetAgentRunResponse,
  ListAgentRunEventsResponse,
  ListAgentRunsResponse,
} from "@miniclaw/shared";

import type { AgentRuntime } from "../agent/runtime.js";

export type AgentRoutesServices = {
  agentRuntime: AgentRuntime;
};

export function createAgentRoutes(services: AgentRoutesServices) {
  const routes = new Hono();

  routes.post("/api/agent/runs", async (c) => {
    let body: CreateAgentRunRequest;

    try {
      body = (await c.req.json()) as CreateAgentRunRequest;
    } catch {
      return c.json({ error: "Request body must be valid JSON." }, 400);
    }

    if (!body || typeof body.input !== "string" || body.input.trim().length === 0) {
      return c.json({ error: "Request body must include a non-empty input string." }, 400);
    }

    const result = await services.agentRuntime.run({
      input: body.input.trim(),
      sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
    });
    const response: CreateAgentRunResponse = result;

    return c.json(response, 202);
  });

  routes.get("/api/agent/runs", (c) => {
    const response: ListAgentRunsResponse = {
      runs: services.agentRuntime.listRuns(),
    };

    return c.json(response);
  });

  routes.get("/api/agent/runs/:runId", (c) => {
    const run = services.agentRuntime.getRun(c.req.param("runId"));

    if (!run) return c.json({ error: "Agent run not found." }, 404);

    const response: GetAgentRunResponse = { run };

    return c.json(response);
  });

  routes.get("/api/agent/runs/:runId/events", (c) => {
    const response: ListAgentRunEventsResponse = {
      events: services.agentRuntime.listRunEvents(c.req.param("runId")),
    };

    return c.json(response);
  });

  return routes;
}
