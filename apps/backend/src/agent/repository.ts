import { DatabaseSync } from "node:sqlite";

import type {
  AgentEventRecord,
  AgentMessage,
  AgentRunListItem,
  AgentRunRecord,
  CompleteRunInput,
  CreateEventInput,
  CreateMessageInput,
  CreateRunInput,
} from "./types.js";
import type { StoragePaths } from "../storage/paths.js";

type RunRow = {
  id: string;
  session_id: string;
  status: string;
  input: string;
  final_response: string | null;
  error: string | null;
  provider_key: string | null;
  model: string | null;
  metadata_json: string;
  started_at: string;
  completed_at: string | null;
};

type EventRow = {
  id: string;
  run_id: string;
  created_at: string;
  type: string;
  message: string;
  payload_json: string;
};

type MessageRow = {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: string;
};

export class AgentRepository {
  private readonly paths: StoragePaths;

  constructor(paths: StoragePaths) {
    this.paths = paths;
  }

  createSession(id: string, createdAt: string): void {
    this.withDb((db) => {
      db.prepare(
        `
          INSERT INTO sessions (id, created_at, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at
        `,
      ).run(id, createdAt, createdAt);
    });
  }

  createRun(input: CreateRunInput): void {
    this.withDb((db) => {
      db.prepare(
        `
          INSERT INTO agent_runs (
            id,
            session_id,
            status,
            input,
            final_response,
            error,
            provider_key,
            model,
            metadata_json,
            started_at,
            completed_at
          )
          VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, NULL)
        `,
      ).run(
        input.id,
        input.sessionId,
        input.status,
        input.input,
        input.providerKey,
        input.model,
        JSON.stringify(input.metadata ?? {}),
        input.startedAt,
      );
    });
  }

  completeRun(input: CompleteRunInput): void {
    this.withDb((db) => {
      db.prepare(
        `
          UPDATE agent_runs
          SET status = ?,
              final_response = ?,
              error = ?,
              provider_key = ?,
              model = ?,
              metadata_json = ?,
              completed_at = ?
          WHERE id = ?
        `,
      ).run(
        input.status,
        input.finalResponse,
        input.error,
        input.providerKey,
        input.model,
        JSON.stringify(input.metadata ?? {}),
        input.completedAt,
        input.id,
      );
    });
  }

  appendEvent(input: CreateEventInput): void {
    this.withDb((db) => {
      db.prepare(
        `
          INSERT INTO agent_events (id, run_id, created_at, type, message, payload_json)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      ).run(
        input.id,
        input.runId,
        input.createdAt,
        input.type,
        input.message,
        JSON.stringify(input.payload ?? {}),
      );
    });
  }

  appendMessage(input: CreateMessageInput): void {
    this.withDb((db) => {
      db.prepare(
        `
          INSERT INTO messages (id, session_id, role, content, created_at)
          VALUES (?, ?, ?, ?, ?)
        `,
      ).run(input.id, input.sessionId, input.role, input.content, input.createdAt);

      db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(
        input.createdAt,
        input.sessionId,
      );
    });
  }

  listSessionMessages(sessionId: string, limit = 12): AgentMessage[] {
    return this.withDb((db) => {
      const rows = db
        .prepare(
          `
            SELECT id, session_id, role, content, created_at
            FROM messages
            WHERE session_id = ?
            ORDER BY created_at DESC
            LIMIT ?
          `,
        )
        .all(sessionId, limit) as MessageRow[];

      return rows.reverse().map(mapMessageRow);
    });
  }

  listRuns(limit = 20): AgentRunListItem[] {
    return this.withDb((db) => {
      const rows = db
        .prepare(
          `
            SELECT id, session_id, status, input, final_response, error, provider_key, model,
                   metadata_json, started_at, completed_at
            FROM agent_runs
            ORDER BY started_at DESC
            LIMIT ?
          `,
        )
        .all(limit) as RunRow[];

      return rows.map(mapRunSummaryRow);
    });
  }

  getRun(id: string): AgentRunRecord | null {
    return this.withDb((db) => {
      const row = db
        .prepare(
          `
            SELECT id, session_id, status, input, final_response, error, provider_key, model,
                   metadata_json, started_at, completed_at
            FROM agent_runs
            WHERE id = ?
          `,
        )
        .get(id) as RunRow | undefined;

      return row ? mapRunDetailRow(row) : null;
    });
  }

  listRunEvents(runId: string): AgentEventRecord[] {
    return this.withDb((db) => {
      const rows = db
        .prepare(
          `
            SELECT id, run_id, created_at, type, message, payload_json
            FROM agent_events
            WHERE run_id = ?
            ORDER BY created_at ASC
          `,
        )
        .all(runId) as EventRow[];

      return rows.map(mapEventRow);
    });
  }

  private withDb<T>(callback: (db: DatabaseSync) => T): T {
    const db = new DatabaseSync(this.paths.databasePath);
    try {
      return callback(db);
    } finally {
      db.close();
    }
  }
}

function mapRunSummaryRow(row: RunRow): AgentRunListItem {
  return {
    id: row.id,
    sessionId: row.session_id,
    status: toRunStatus(row.status),
    input: row.input,
    finalResponse: row.final_response,
    error: row.error,
    providerKey: row.provider_key,
    model: row.model,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function mapRunDetailRow(row: RunRow): AgentRunRecord {
  return {
    ...mapRunSummaryRow(row),
    metadata: parsePayload(row.metadata_json),
  };
}

function mapEventRow(row: EventRow): AgentEventRecord {
  return {
    id: row.id,
    runId: row.run_id,
    createdAt: row.created_at,
    type: row.type,
    message: row.message,
    payload: parsePayload(row.payload_json),
  };
}

function mapMessageRow(row: MessageRow): AgentMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    createdAt: row.created_at,
  };
}

function toRunStatus(status: string): AgentRunListItem["status"] {
  if (status === "completed" || status === "failed") return status;
  return "running";
}

function parsePayload(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
