import { Hono } from "hono";

import type { HealthResponse } from "@miniclaw/shared";

export function createHealthRoutes(version: string) {
  const routes = new Hono();

  routes.get("/health", (c) => {
    const response: HealthResponse = {
      ok: true,
      name: "miniclaw-backend",
      version,
    };

    return c.json(response);
  });

  return routes;
}
