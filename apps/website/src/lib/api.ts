import type {
  ConfigResponse,
  HealthResponse,
  MiniclawConfig,
  SystemPathsResponse,
  UpdateConfigRequest,
} from "@miniclaw/shared";

const API_BASE_URL = import.meta.env.VITE_MINICLAW_API_URL ?? "http://127.0.0.1:3001";

export type BootstrapState =
  | {
      status: "ready";
      health: HealthResponse;
      config: ConfigResponse;
      paths: SystemPathsResponse;
    }
  | {
      status: "offline";
      message: string;
    };

export async function fetchBootstrap(): Promise<BootstrapState> {
  try {
    const [health, config, paths] = await Promise.all([
      request<HealthResponse>("/health"),
      request<ConfigResponse>("/api/config"),
      request<SystemPathsResponse>("/api/system/paths"),
    ]);

    return {
      status: "ready",
      health,
      config,
      paths,
    };
  } catch (error) {
    return {
      status: "offline",
      message: error instanceof Error ? error.message : "Backend is unavailable.",
    };
  }
}

export async function saveConfig(config: MiniclawConfig): Promise<ConfigResponse> {
  const body: UpdateConfigRequest = { config };

  return request<ConfigResponse>("/api/config", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${path}`);
  }

  return (await response.json()) as T;
}
