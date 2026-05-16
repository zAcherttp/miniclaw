import { Hono } from "hono";
import { logger } from "hono/logger";

const app = new Hono();
app.use(logger());

app.get("/", (c) => c.json({ name: "miniclaw-backend", status: "ok" }));
app.get("/health", (c) => c.json({ ok: true }));

export { app };
export type AppType = typeof app;
