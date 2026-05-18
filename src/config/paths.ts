import path from 'path';
import os from 'os';
import fs from 'fs';

export function getAppDir(): string {
  const dir = path.join(os.homedir(), '.miniclaw');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getConfigPath(): string {
  return path.join(getAppDir(), 'config.json');
}

export function getEnvPath(): string {
  return path.join(getAppDir(), '.env');
}

export function getWorkspaceDir(customPath?: string): string {
  const wsPath = customPath ? customPath.replace('~', os.homedir()) : path.join(getAppDir(), 'workspace');
  if (!fs.existsSync(wsPath)) fs.mkdirSync(wsPath, { recursive: true });
  return wsPath;
}
