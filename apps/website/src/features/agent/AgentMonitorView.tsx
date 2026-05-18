import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { Send, RefreshCw } from "lucide-react";
import type {
  AgentRunDetail,
  AgentRunEventRecord,
  AgentRunSummary,
  MiniclawConfig,
} from "@miniclaw/shared";

import { Button } from "#components/ui/button";
import { cn } from "#lib/utils";

import { Field } from "../../components/layout/Field";
import { createAgentRun, getAgentRun, listAgentRunEvents, listAgentRuns } from "../../lib/api";

type AgentMonitorViewProps = {
  config: MiniclawConfig;
};

type MonitorState = {
  events: AgentRunEventRecord[];
  runs: AgentRunSummary[];
  selectedRun: AgentRunDetail | null;
};

export function AgentMonitorView({ config }: AgentMonitorViewProps) {
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<MonitorState>({
    events: [],
    runs: [],
    selectedRun: null,
  });

  const activeProvider = config.providers.activeProvider;
  const provider = activeProvider ? config.providers.items[activeProvider] : null;
  const providerStatus = useMemo(() => {
    if (!activeProvider) return "No provider selected";
    if (!provider) return "Provider config missing";
    if (!provider.model) return "Model missing";
    return `${provider.kind} / ${provider.model}`;
  }, [activeProvider, provider]);

  const refresh = useCallback(
    async (nextSelectedRunId = selectedRunId) => {
      setLoading(true);
      setError(null);

      try {
        const runsResponse = await listAgentRuns();
        const runId = nextSelectedRunId ?? runsResponse.runs[0]?.id ?? null;
        const [runResponse, eventsResponse] = runId
          ? await Promise.all([getAgentRun(runId), listAgentRunEvents(runId)])
          : [null, null];

        setSelectedRunId(runId);
        setState({
          runs: runsResponse.runs,
          selectedRun: runResponse?.run ?? null,
          events: eventsResponse?.events ?? [],
        });
      } catch (refreshError) {
        setError(refreshError instanceof Error ? refreshError.message : "Failed to load runs.");
      } finally {
        setLoading(false);
      }
    },
    [selectedRunId],
  );

  useEffect(() => {
    void refresh(null);
  }, [refresh]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (input.trim().length === 0) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await createAgentRun({ input: input.trim() });
      setInput("");
      await refresh(response.runId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to start run.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="grid min-w-0 gap-5">
        <div className="grid gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Agent Monitor</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Phase 2 debug harness for direct runtime invocation. Normal interaction remains
            channel-first; Telegram becomes the primary surface when the channel runtime lands.
          </p>
        </div>

        <div className="grid gap-3 rounded-md border border-border p-4">
          <div className="grid gap-1">
            <span className="text-xs font-medium uppercase text-muted-foreground">
              Active provider
            </span>
            <span className="text-sm font-medium">{activeProvider ?? "Not selected"}</span>
            <span className="text-xs text-muted-foreground">{providerStatus}</span>
          </div>

          <form className="grid gap-3" onSubmit={handleSubmit}>
            <Field label="Debug input">
              <textarea
                value={input}
                onChange={(event) => setInput(event.currentTarget.value)}
                placeholder="Plan my day around standup, focused work, and errands."
                className="min-h-28 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring/30"
              />
            </Field>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={submitting || input.trim().length === 0}>
                <Send />
                {submitting ? "Running" : "Run Debug Turn"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void refresh()}
                disabled={loading}
              >
                <RefreshCw />
                Refresh
              </Button>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </form>
        </div>

        <SelectedRun run={state.selectedRun} events={state.events} />
      </section>

      <aside className="grid content-start gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent runs</h2>
          {loading ? <span className="text-xs text-muted-foreground">Loading</span> : null}
        </div>
        <div className="grid gap-2">
          {state.runs.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              No runs yet.
            </p>
          ) : (
            state.runs.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => void refresh(run.id)}
                className={cn(
                  "grid gap-2 rounded-md border p-3 text-left text-sm transition-colors",
                  selectedRunId === run.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-medium">{run.input}</span>
                  <StatusPill status={run.status} />
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(run.startedAt).toLocaleString()}
                </span>
              </button>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

function SelectedRun({
  events,
  run,
}: {
  events: AgentRunEventRecord[];
  run: AgentRunDetail | null;
}) {
  if (!run) {
    return (
      <section className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
        Select or start a run to inspect the timeline.
      </section>
    );
  }

  return (
    <section className="grid gap-5">
      <div className="grid gap-2 rounded-md border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Selected run</h2>
          <StatusPill status={run.status} />
        </div>
        <div className="grid gap-2 text-sm">
          <DetailRow label="Run ID" value={run.id} />
          <DetailRow label="Session" value={run.sessionId} />
          <DetailRow label="Provider" value={run.providerKey ?? "Not resolved"} />
          <DetailRow label="Model" value={run.model ?? "Not resolved"} />
        </div>
      </div>

      <div className="grid gap-2">
        <h2 className="text-sm font-semibold">Assistant response</h2>
        <div className="min-h-24 whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-4 text-sm">
          {run.finalResponse ?? run.error ?? "No response recorded yet."}
        </div>
      </div>

      <div className="grid gap-2">
        <h2 className="text-sm font-semibold">Timeline</h2>
        <div className="grid gap-2">
          {events.map((event) => (
            <div key={event.id} className="grid gap-1 rounded-md border border-border p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{event.type}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(event.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-muted-foreground">{event.message}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-3">
      <span className="text-muted-foreground">{label}</span>
      <code className="min-w-0 break-all rounded bg-muted px-2 py-1 text-xs">{value}</code>
    </div>
  );
}

function StatusPill({ status }: { status: AgentRunSummary["status"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        status === "completed" && "bg-emerald-100 text-emerald-700",
        status === "failed" && "bg-destructive/10 text-destructive",
        status === "running" && "bg-amber-100 text-amber-700",
      )}
    >
      {status}
    </span>
  );
}
