import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type StoragePaths = {
  workspaceRoot: string;
  home: string;
  configPath: string;
  databasePath: string;
  logsPath: string;
  appEventsPath: string;
  channelEventsPath: string;
  agentEventsPath: string;
  exportsPath: string;
};

const currentDir = dirname(fileURLToPath(import.meta.url));

export function resolveStoragePaths(env: NodeJS.ProcessEnv = process.env): StoragePaths {
  const workspaceRoot = findWorkspaceRoot(currentDir);
  const home = resolve(env.MINICLAW_HOME ?? join(workspaceRoot, ".miniclaw"));
  const logsPath = join(home, "logs");

  return {
    workspaceRoot,
    home,
    configPath: join(home, "config.json"),
    databasePath: join(home, "miniclaw.db"),
    logsPath,
    appEventsPath: join(logsPath, "app-events.jsonl"),
    channelEventsPath: join(logsPath, "channel-events.jsonl"),
    agentEventsPath: join(logsPath, "agent-events.jsonl"),
    exportsPath: join(home, "exports"),
  };
}

export async function ensureStoragePaths(paths: StoragePaths): Promise<void> {
  await Promise.all([
    mkdir(paths.home, { recursive: true }),
    mkdir(paths.logsPath, { recursive: true }),
    mkdir(paths.exportsPath, { recursive: true }),
  ]);
}

function findWorkspaceRoot(start: string): string {
  let current = resolve(start);

  while (true) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;

    const parent = dirname(current);
    if (parent === current) return process.cwd();
    current = parent;
  }
}
