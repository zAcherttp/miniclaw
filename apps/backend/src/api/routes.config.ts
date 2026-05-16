import { Hono } from "hono";

import {
  redactConfig,
  type ConfigResponse,
  type SystemPathsResponse,
  type UpdateConfigRequest,
} from "@miniclaw/shared";

import type { ConfigStore } from "../config/loader.js";
import { appendAppEvent } from "../storage/logs.js";
import type { StoragePaths } from "../storage/paths.js";

export type ConfigRoutesServices = {
  configStore: ConfigStore;
  paths: StoragePaths;
};

export function createConfigRoutes(services: ConfigRoutesServices) {
  const routes = new Hono();

  routes.get("/api/config", async (c) => {
    const config = await services.configStore.load();
    const response: ConfigResponse = {
      config: redactConfig(config),
      meta: {
        path: services.paths.configPath,
        secretsRedacted: true,
      },
    };

    return c.json(response);
  });

  routes.put("/api/config", async (c) => {
    let body: UpdateConfigRequest;

    try {
      body = (await c.req.json()) as UpdateConfigRequest;
    } catch {
      return c.json({ error: "Request body must be valid JSON." }, 400);
    }

    if (!body || typeof body !== "object" || !("config" in body)) {
      return c.json({ error: "Request body must include a config object." }, 400);
    }

    const config = await services.configStore.update(body.config);
    await appendAppEvent(services.paths, {
      type: "config.updated",
      payload: { source: "api" },
    });

    const response: ConfigResponse = {
      config: redactConfig(config),
      meta: {
        path: services.paths.configPath,
        secretsRedacted: true,
      },
    };

    return c.json(response);
  });

  routes.get("/api/system/paths", (c) => {
    const response: SystemPathsResponse = {
      home: services.paths.home,
      configPath: services.paths.configPath,
      databasePath: services.paths.databasePath,
      logsPath: services.paths.logsPath,
    };

    return c.json(response);
  });

  return routes;
}
