import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  normalizeConfig,
  redactConfig,
  type CreateAgentRunResponse,
  type GetAgentRunResponse,
  type ListAgentRunEventsResponse,
} from "@miniclaw/shared";
import { afterEach, expect, test } from "vite-plus/test";

import { AgentRepository } from "../src/agent/repository.ts";
import { createAgentRuntime, createFakeChatModel } from "../src/agent/runtime.ts";
import { createApp, type AppServices } from "../src/app.ts";
import { createConfigStore } from "../src/config/loader.ts";
import { initializeDatabase } from "../src/storage/db.ts";
import { resolveStoragePaths, type StoragePaths } from "../src/storage/paths.ts";

const tempHomes: string[] = [];

afterEach(async () => {
  await Promise.all(tempHomes.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

test("provider config normalization defaults legacy providers to openai-compatible", () => {
  const config = normalizeConfig({
    providers: {
      activeProvider: "openrouter",
      items: {
        openrouter: {
          apiKey: "${OPENROUTER_API_KEY}",
          model: "openai/gpt-4.1-mini",
        },
      },
    },
  });

  expect(config.providers.items.openrouter?.kind).toBe("openai-compatible");
  expect(redactConfig(config).providers.items.openrouter?.apiKey).toBe("${OPENROUTER_API_KEY}");

  const redacted = redactConfig(
    normalizeConfig({
      providers: {
        activeProvider: "direct",
        items: {
          direct: {
            apiKey: "sk-test",
            model: "gpt-test",
          },
        },
      },
    }),
  );

  expect(redacted.providers.items.direct?.apiKey).toBe("********");
});

test("fake provider agent run persists run, messages, and timeline events", async () => {
  const services = await createTestServices();

  await services.configStore.save(
    normalizeConfig({
      providers: {
        activeProvider: "fake",
        items: {
          fake: {
            kind: "openai-compatible",
            apiKey: null,
            baseUrl: null,
            model: "fake-model",
          },
        },
      },
    }),
  );

  const result = await services.agentRuntime.run({ input: "Plan my afternoon." });
  const run = services.agentRuntime.getRun(result.runId);
  const events = services.agentRuntime.listRunEvents(result.runId);

  expect(run?.status).toBe("completed");
  expect(run?.finalResponse).toBe("Test assistant response.");
  expect(run?.providerKey).toBe("fake");
  expect(run?.model).toBe("fake-model");
  expect(events.map((event) => event.type)).toContain("completeRun");
  expect(services.agentRuntime.listRuns()[0]?.id).toBe(result.runId);
});

test("debug API creates and returns a persisted fake-provider run", async () => {
  const services = await createTestServices();
  const app = createApp(services);

  const response = await app.request("/api/agent/runs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: "Scrum my morning." }),
  });

  expect(response.status).toBe(202);

  const created = (await response.json()) as CreateAgentRunResponse;
  const runResponse = await app.request(`/api/agent/runs/${created.runId}`);
  const eventsResponse = await app.request(`/api/agent/runs/${created.runId}/events`);

  expect(runResponse.status).toBe(200);
  expect(eventsResponse.status).toBe(200);

  const runBody = (await runResponse.json()) as GetAgentRunResponse;
  const eventsBody = (await eventsResponse.json()) as ListAgentRunEventsResponse;

  expect(runBody.run.sessionId).toBe(created.sessionId);
  expect(runBody.run.status).toBe("completed");
  expect(runBody.run.finalResponse).toBe("Test assistant response.");
  expect(eventsBody.events.length).toBeGreaterThan(0);
});

test("missing provider model fails the run with provider_unavailable event", async () => {
  const paths = await createTempPaths();
  await initializeDatabase(paths);

  const configStore = createConfigStore(paths);
  await configStore.save(
    normalizeConfig({
      providers: {
        activeProvider: "openrouter",
        items: {
          openrouter: {
            kind: "openai-compatible",
            apiKey: "${OPENROUTER_API_KEY}",
            baseUrl: "https://openrouter.ai/api/v1",
            model: null,
          },
        },
      },
    }),
  );

  const repository = new AgentRepository(paths);
  const runtime = createAgentRuntime({ configStore, repository });
  const result = await runtime.run({ input: "Plan my day." });
  const run = runtime.getRun(result.runId);
  const events = runtime.listRunEvents(result.runId);

  expect(run?.status).toBe("failed");
  expect(run?.error).toContain("must configure a model");
  expect(events.map((event) => event.type)).toContain("provider_unavailable");
});

async function createTestServices(): Promise<AppServices> {
  const paths = await createTempPaths();
  await initializeDatabase(paths);

  const configStore = createConfigStore(paths);
  await configStore.save(
    normalizeConfig({
      providers: {
        activeProvider: "fake",
        items: {
          fake: {
            kind: "openai-compatible",
            apiKey: null,
            baseUrl: null,
            model: "fake-model",
          },
        },
      },
    }),
  );

  const repository = new AgentRepository(paths);
  const agentRuntime = createAgentRuntime({
    configStore,
    repository,
    providerFactory: () => ({
      providerKey: "fake",
      model: "fake-model",
      chatModel: createFakeChatModel("Test assistant response."),
    }),
  });

  return {
    agentRuntime,
    configStore,
    paths,
    ready: Promise.resolve(),
  };
}

async function createTempPaths(): Promise<StoragePaths> {
  const home = await mkdtemp(join(tmpdir(), "miniclaw-test-"));
  tempHomes.push(home);

  return resolveStoragePaths({
    ...process.env,
    MINICLAW_HOME: home,
  });
}
