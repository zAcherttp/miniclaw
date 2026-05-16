import { appendFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

import type { AppEvent } from "@miniclaw/shared";

import { ensureStoragePaths, type StoragePaths } from "./paths.js";

export type AppEventInput = {
  type: string;
  payload?: unknown;
};

export async function appendAppEvent(paths: StoragePaths, event: AppEventInput): Promise<AppEvent> {
  await ensureStoragePaths(paths);

  const entry: AppEvent = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    type: event.type,
    payload: event.payload ?? {},
  };

  await appendFile(paths.appEventsPath, `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}
