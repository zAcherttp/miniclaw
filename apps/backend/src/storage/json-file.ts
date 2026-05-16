import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

import { ensureStoragePaths, type StoragePaths } from "./paths.js";

export async function readJsonFile(path: string): Promise<unknown> {
  const content = await readFile(path, "utf8");
  return JSON.parse(content) as unknown;
}

export async function writeJsonFileAtomic(path: string, value: unknown): Promise<void> {
  const tempPath = `${path}.${randomUUID()}.tmp`;
  const content = `${JSON.stringify(value, null, 2)}\n`;

  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, path);
}

export async function ensureParentForFile(paths: StoragePaths, path: string): Promise<void> {
  if (dirname(path) === paths.home) {
    await ensureStoragePaths(paths);
    return;
  }
  await ensureStoragePaths(paths);
}
