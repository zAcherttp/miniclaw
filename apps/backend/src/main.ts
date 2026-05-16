import { serve } from "@hono/node-server";

import { app, services } from "./app.js";

await services.ready;

const config = await services.configStore.load();
const port = Number(process.env.PORT ?? config.server.port);
const hostname = process.env.HOST ?? config.server.host;

serve({ fetch: app.fetch, hostname, port });

console.log(`Backend listening on http://${hostname}:${port}`);
