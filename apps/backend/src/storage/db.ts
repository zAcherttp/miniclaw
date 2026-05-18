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

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        title TEXT
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        status TEXT NOT NULL,
        input TEXT NOT NULL,
        final_response TEXT,
        error TEXT,
        provider_key TEXT,
        model TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        started_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS agent_events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES agent_runs(id)
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session_created
        ON messages(session_id, created_at);

      CREATE INDEX IF NOT EXISTS idx_agent_runs_started
        ON agent_runs(started_at);

      CREATE INDEX IF NOT EXISTS idx_agent_events_run_created
        ON agent_events(run_id, created_at);
    `);
  } finally {
    db.close();
  }
}
