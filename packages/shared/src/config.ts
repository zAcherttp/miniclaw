export type TelegramMode = "polling" | "webhook";
export type TelegramGroupPolicy = "private-only" | "mention";

export type ProviderItemConfig = {
  apiKey: string | null;
  baseUrl: string | null;
  model: string | null;
};

export type ProvidersConfig = {
  activeProvider: string | null;
  items: Record<string, ProviderItemConfig>;
};

export type ServerConfig = {
  host: string;
  port: number;
  publicBaseUrl: string | null;
};

export type DashboardConfig = {
  authEnabled: boolean;
};

export type TelegramChannelConfig = {
  enabled: boolean;
  mode: TelegramMode;
  botToken: string | null;
  allowedUserIds: string[];
  streaming: boolean;
  groupPolicy: TelegramGroupPolicy;
};

export type ChannelsConfig = {
  telegram: TelegramChannelConfig;
};

export type GwsCalendarConnectorConfig = {
  enabled: boolean;
  command: string;
};

export type CalendarConnectorsConfig = {
  activeConnector: "gws" | "lark" | null;
  gws: GwsCalendarConnectorConfig;
};

export type ConnectorsConfig = {
  calendar: CalendarConnectorsConfig;
};

export type MiniclawConfig = {
  server: ServerConfig;
  dashboard: DashboardConfig;
  providers: ProvidersConfig;
  channels: ChannelsConfig;
  connectors: ConnectorsConfig;
};

export const defaultMiniclawConfig: MiniclawConfig = {
  server: {
    host: "127.0.0.1",
    port: 3001,
    publicBaseUrl: null,
  },
  dashboard: {
    authEnabled: false,
  },
  providers: {
    activeProvider: null,
    items: {},
  },
  channels: {
    telegram: {
      enabled: false,
      mode: "polling",
      botToken: "${TELEGRAM_BOT_TOKEN}",
      allowedUserIds: [],
      streaming: true,
      groupPolicy: "private-only",
    },
  },
  connectors: {
    calendar: {
      activeConnector: "gws",
      gws: {
        enabled: false,
        command: "gws",
      },
    },
  },
};

export function cloneDefaultConfig(): MiniclawConfig {
  return JSON.parse(JSON.stringify(defaultMiniclawConfig)) as MiniclawConfig;
}

export function mergeConfig(base: MiniclawConfig, patch: unknown): MiniclawConfig {
  if (!isRecord(patch)) return base;

  return {
    server: mergeServerConfig(base.server, patch.server),
    dashboard: mergeDashboardConfig(base.dashboard, patch.dashboard),
    providers: mergeProvidersConfig(base.providers, patch.providers),
    channels: mergeChannelsConfig(base.channels, patch.channels),
    connectors: mergeConnectorsConfig(base.connectors, patch.connectors),
  };
}

export function normalizeConfig(value: unknown): MiniclawConfig {
  return mergeConfig(cloneDefaultConfig(), value);
}

export function redactConfig(config: MiniclawConfig): MiniclawConfig {
  return {
    ...config,
    providers: {
      ...config.providers,
      items: Object.fromEntries(
        Object.entries(config.providers.items).map(([key, item]) => [
          key,
          {
            ...item,
            apiKey: redactSecret(item.apiKey),
          },
        ]),
      ),
    },
    channels: {
      ...config.channels,
      telegram: {
        ...config.channels.telegram,
        botToken: redactSecret(config.channels.telegram.botToken),
      },
    },
  };
}

export function redactSecret(value: string | null): string | null {
  if (!value) return value;
  if (isEnvReference(value)) return value;
  return "********";
}

export function isEnvReference(value: string): boolean {
  return /^\$\{[A-Z_][A-Z0-9_]*\}$/.test(value);
}

function mergeServerConfig(base: ServerConfig, value: unknown): ServerConfig {
  if (!isRecord(value)) return base;

  return {
    host: readString(value.host, base.host),
    port: readPort(value.port, base.port),
    publicBaseUrl: readNullableString(value.publicBaseUrl, base.publicBaseUrl),
  };
}

function mergeDashboardConfig(base: DashboardConfig, value: unknown): DashboardConfig {
  if (!isRecord(value)) return base;

  return {
    authEnabled: readBoolean(value.authEnabled, base.authEnabled),
  };
}

function mergeProvidersConfig(base: ProvidersConfig, value: unknown): ProvidersConfig {
  if (!isRecord(value)) return base;

  const items = isRecord(value.items)
    ? Object.fromEntries(
        Object.entries(value.items)
          .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
          .map(([key, item]) => [
            key,
            {
              apiKey: readNullableString(item.apiKey, base.items[key]?.apiKey ?? null),
              baseUrl: readNullableString(item.baseUrl, base.items[key]?.baseUrl ?? null),
              model: readNullableString(item.model, base.items[key]?.model ?? null),
            },
          ]),
      )
    : base.items;

  return {
    activeProvider: readNullableString(value.activeProvider, base.activeProvider),
    items,
  };
}

function mergeChannelsConfig(base: ChannelsConfig, value: unknown): ChannelsConfig {
  if (!isRecord(value)) return base;

  return {
    telegram: mergeTelegramConfig(base.telegram, value.telegram),
  };
}

function mergeTelegramConfig(base: TelegramChannelConfig, value: unknown): TelegramChannelConfig {
  if (!isRecord(value)) return base;

  return {
    enabled: readBoolean(value.enabled, base.enabled),
    mode: readTelegramMode(value.mode, base.mode),
    botToken: readNullableString(value.botToken, base.botToken),
    allowedUserIds: readStringArray(value.allowedUserIds, base.allowedUserIds),
    streaming: readBoolean(value.streaming, base.streaming),
    groupPolicy: readTelegramGroupPolicy(value.groupPolicy, base.groupPolicy),
  };
}

function mergeConnectorsConfig(base: ConnectorsConfig, value: unknown): ConnectorsConfig {
  if (!isRecord(value)) return base;

  return {
    calendar: mergeCalendarConnectorsConfig(base.calendar, value.calendar),
  };
}

function mergeCalendarConnectorsConfig(
  base: CalendarConnectorsConfig,
  value: unknown,
): CalendarConnectorsConfig {
  if (!isRecord(value)) return base;

  return {
    activeConnector: readCalendarConnector(value.activeConnector, base.activeConnector),
    gws: mergeGwsConfig(base.gws, value.gws),
  };
}

function mergeGwsConfig(
  base: GwsCalendarConnectorConfig,
  value: unknown,
): GwsCalendarConnectorConfig {
  if (!isRecord(value)) return base;

  return {
    enabled: readBoolean(value.enabled, base.enabled),
    command: readString(value.command, base.command),
  };
}

function readTelegramMode(value: unknown, fallback: TelegramMode): TelegramMode {
  return value === "polling" || value === "webhook" ? value : fallback;
}

function readTelegramGroupPolicy(
  value: unknown,
  fallback: TelegramGroupPolicy,
): TelegramGroupPolicy {
  return value === "private-only" || value === "mention" ? value : fallback;
}

function readCalendarConnector(
  value: unknown,
  fallback: CalendarConnectorsConfig["activeConnector"],
): CalendarConnectorsConfig["activeConnector"] {
  return value === "gws" || value === "lark" || value === null ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readNullableString(value: unknown, fallback: string | null): string | null {
  return typeof value === "string" || value === null ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readPort(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 65_535
    ? value
    : fallback;
}

function readStringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
