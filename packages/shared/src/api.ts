import type { MiniclawConfig } from "./config.js";

export type HealthResponse = {
  ok: true;
  name: "miniclaw-backend";
  version: string;
};

export type ConfigResponse = {
  config: MiniclawConfig;
  meta: {
    path: string;
    secretsRedacted: true;
  };
};

export type UpdateConfigRequest = {
  config: Partial<MiniclawConfig>;
};

export type SystemPathsResponse = {
  home: string;
  configPath: string;
  databasePath: string;
  logsPath: string;
};
