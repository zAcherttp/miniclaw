import { useCallback, useEffect, useState } from "react";

import type { MiniclawConfig, SystemPathsResponse } from "@miniclaw/shared";

import { AppShell } from "../components/layout/AppShell";
import { AgentMonitorView } from "../features/agent/AgentMonitorView";
import { TelegramView } from "../features/channels/TelegramView";
import { CalendarConnectorView } from "../features/connectors/CalendarConnectorView";
import { OverviewView } from "../features/overview/OverviewView";
import { ProvidersView } from "../features/providers/ProvidersView";
import { SettingsView } from "../features/settings/SettingsView";
import { fetchBootstrap, saveConfig } from "../lib/api";
import { type ViewId } from "./navigation";

type LoadState =
  | { status: "loading" }
  | { status: "offline"; message: string }
  | {
      status: "ready";
      config: MiniclawConfig;
      paths: SystemPathsResponse;
    };

export function App() {
  const [activeView, setActiveView] = useState<ViewId>("overview");
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setState({ status: "loading" });
    const result = await fetchBootstrap();

    if (result.status === "offline") {
      setState({ status: "offline", message: result.message });
      return;
    }

    setState({
      status: "ready",
      config: result.config.config,
      paths: result.paths,
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const config = state.status === "ready" ? state.config : null;

  async function handleSave() {
    if (!config) return;

    setSaving(true);
    try {
      const response = await saveConfig(config);
      setState((current) =>
        current.status === "ready" ? { ...current, config: response.config } : current,
      );
    } finally {
      setSaving(false);
    }
  }

  function handleConfigChange(next: MiniclawConfig) {
    setState((current) =>
      current.status === "ready"
        ? {
            ...current,
            config: next,
          }
        : current,
    );
  }

  return (
    <AppShell
      activeView={activeView}
      backendStatus={state.status === "offline" ? "offline" : "ready"}
      saving={saving}
      onRefresh={refresh}
      onSave={handleSave}
      onViewChange={setActiveView}
    >
      {state.status === "loading" ? (
        <LoadingView />
      ) : state.status === "offline" ? (
        <OfflineView message={state.message} />
      ) : (
        <ActiveView
          activeView={activeView}
          config={state.config}
          paths={state.paths}
          onChange={handleConfigChange}
        />
      )}
    </AppShell>
  );
}

function ActiveView({
  activeView,
  config,
  onChange,
  paths,
}: {
  activeView: ViewId;
  config: MiniclawConfig;
  onChange: (config: MiniclawConfig) => void;
  paths: SystemPathsResponse | null;
}) {
  if (activeView === "agent") return <AgentMonitorView config={config} />;
  if (activeView === "providers") return <ProvidersView config={config} onChange={onChange} />;
  if (activeView === "telegram") return <TelegramView config={config} onChange={onChange} />;
  if (activeView === "calendar") {
    return <CalendarConnectorView config={config} onChange={onChange} />;
  }
  if (activeView === "settings") return <SettingsView config={config} onChange={onChange} />;

  return <OverviewView config={config} paths={paths} />;
}

function LoadingView() {
  return <p className="text-sm text-muted-foreground">Loading backend configuration...</p>;
}

function OfflineView({ message }: { message: string }) {
  return (
    <section className="grid max-w-xl gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">Backend offline</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <p className="text-sm text-muted-foreground">
        Start the backend with the workspace dev command, then refresh this dashboard.
      </p>
    </section>
  );
}
