import { access } from "node:fs/promises";

import {
  cloneDefaultConfig,
  mergeConfig,
  normalizeConfig,
  type MiniclawConfig,
} from "@miniclaw/shared";

import { ensureParentForFile, readJsonFile, writeJsonFileAtomic } from "../storage/json-file.js";
import type { StoragePaths } from "../storage/paths.js";

export type ConfigStore = {
  load(): Promise<MiniclawConfig>;
  save(config: MiniclawConfig): Promise<MiniclawConfig>;
  update(patch: unknown): Promise<MiniclawConfig>;
};

export function createConfigStore(paths: StoragePaths): ConfigStore {
  return {
    async load() {
      await ensureParentForFile(paths, paths.configPath);

      if (!(await fileExists(paths.configPath))) {
        const initial = cloneDefaultConfig();
        await writeJsonFileAtomic(paths.configPath, initial);
        return initial;
      }

      return normalizeConfig(await readJsonFile(paths.configPath));
    },
    async save(config) {
      const normalized = normalizeConfig(config);
      await ensureParentForFile(paths, paths.configPath);
      await writeJsonFileAtomic(paths.configPath, normalized);
      return normalized;
    },
    async update(patch) {
      const current = await this.load();
      return this.save(mergeConfig(current, patch));
    },
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
