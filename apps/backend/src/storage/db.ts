import { DatabaseSync } from "node:sqlite";

import { ensureStoragePaths, type StoragePaths } from "./paths.js";

export async function initializeDatabase(paths: StoragePaths): Promise<void> {
  await ensureStoragePaths(paths);

  const db = new DatabaseSync(paths.databasePath);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_events (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
    `);
  } finally {
    db.close();
  }
}
