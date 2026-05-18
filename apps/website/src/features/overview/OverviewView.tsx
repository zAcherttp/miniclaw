import type { MiniclawConfig, SystemPathsResponse } from "@miniclaw/shared";

type OverviewViewProps = {
  config: MiniclawConfig;
  paths: SystemPathsResponse | null;
};

export function OverviewView({ config, paths }: OverviewViewProps) {
  const providerConfigured = config.providers.activeProvider !== null;
  const rows = [
    ["Provider", providerConfigured ? config.providers.activeProvider : "Not selected"],
    ["Telegram", config.channels.telegram.enabled ? "Enabled" : "Disabled"],
    ["Calendar", config.connectors.calendar.gws.enabled ? "gws enabled" : "Disabled"],
    ["Dashboard auth", config.dashboard.authEnabled ? "Enabled" : "Disabled"],
  ];

  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Foundation status</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Phase 2 adds the local agent runtime, persisted run history, and a dashboard debug monitor
          while normal user interaction remains channel-first.
        </p>
      </section>

      <section className="grid max-w-3xl gap-3">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="grid grid-cols-[180px_1fr] items-center border-b border-border py-3 text-sm"
          >
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium">{value}</span>
          </div>
        ))}
      </section>

      <section className="grid max-w-3xl gap-3">
        <h2 className="text-sm font-semibold">Local paths</h2>
        {paths ? (
          <div className="grid gap-2 text-sm">
            <PathRow label="Home" value={paths.home} />
            <PathRow label="Config" value={paths.configPath} />
            <PathRow label="Database" value={paths.databasePath} />
            <PathRow label="Logs" value={paths.logsPath} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Paths load when the backend is connected.</p>
        )}
      </section>
    </div>
  );
}

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-3">
      <span className="text-muted-foreground">{label}</span>
      <code className="min-w-0 break-all rounded-md bg-muted px-2 py-1 text-xs">{value}</code>
    </div>
  );
}
