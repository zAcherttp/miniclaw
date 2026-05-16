import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { createConfigRoutes } from "./api/routes.config.js";
import { createHealthRoutes } from "./api/routes.health.js";
import { createConfigStore, type ConfigStore } from "./config/loader.js";
import { initializeDatabase } from "./storage/db.js";
import { appendAppEvent } from "./storage/logs.js";
import { ensureStoragePaths, resolveStoragePaths, type StoragePaths } from "./storage/paths.js";

export type AppServices = {
  configStore: ConfigStore;
  paths: StoragePaths;
  ready: Promise<void>;
};

const version = "0.0.0";

export function createApp(services: AppServices) {
  const app = new Hono();

  app.use("*", cors());
  app.use(logger());
  app.use(async (_c, next) => {
    await services.ready;
    await next();
  });

  app.get("/", (c) => c.json({ name: "miniclaw-backend", status: "ok" }));
  app.route("/", createHealthRoutes(version));
  app.route("/", createConfigRoutes(services));

  return app;
}

export function createDefaultServices(): AppServices {
  const paths = resolveStoragePaths();
  const configStore = createConfigStore(paths);
  const ready = bootstrapStorage(paths, configStore);

  return {
    configStore,
    paths,
    ready,
  };
}

async function bootstrapStorage(paths: StoragePaths, configStore: ConfigStore): Promise<void> {
  await ensureStoragePaths(paths);
  await configStore.load();
  await initializeDatabase(paths);
  await appendAppEvent(paths, {
    type: "backend.started",
    payload: { version },
  });
}

const services = createDefaultServices();
const app = createApp(services);

export { app };
export type AppType = typeof app;
export { services };
