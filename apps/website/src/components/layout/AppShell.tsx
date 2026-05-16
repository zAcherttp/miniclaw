import { RefreshCw, Save } from "lucide-react";

import { Button } from "#components/ui/button";
import { cn } from "#lib/utils";

import { navigationItems, type ViewId } from "../../app/navigation";

type AppShellProps = {
  activeView: ViewId;
  backendStatus: "ready" | "offline";
  children: React.ReactNode;
  saving: boolean;
  onRefresh: () => void;
  onSave: () => void;
  onViewChange: (view: ViewId) => void;
};

export function AppShell({
  activeView,
  backendStatus,
  children,
  saving,
  onRefresh,
  onSave,
  onViewChange,
}: AppShellProps) {
  return (
    <div className="grid min-h-svh grid-cols-[260px_1fr] bg-background text-foreground">
      <aside className="flex min-h-svh flex-col border-r border-border bg-sidebar">
        <div className="border-b border-sidebar-border px-5 py-5">
          <p className="text-sm font-semibold">Miniclaw</p>
          <p className="mt-1 text-xs text-muted-foreground">Personal schedule agent</p>
        </div>

        <nav className="flex-1 px-3 py-4">
          <div className="mb-2 px-2 text-xs font-medium text-muted-foreground">Workspace</div>
          <div className="grid gap-1">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const active = item.id === activeView;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onViewChange(item.id)}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-sidebar-border px-5 py-4">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={cn(
                "size-2 rounded-full",
                backendStatus === "ready" ? "bg-emerald-500" : "bg-destructive",
              )}
            />
            <span className="text-muted-foreground">
              Backend {backendStatus === "ready" ? "connected" : "offline"}
            </span>
          </div>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="flex h-14 items-center justify-between border-b border-border px-6">
          <div>
            <p className="text-sm font-medium">
              {navigationItems.find((item) => item.id === activeView)?.label}
            </p>
            <p className="text-xs text-muted-foreground">
              Configure foundation settings for the channel-first assistant.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onRefresh}>
              <RefreshCw />
              Refresh
            </Button>
            <Button onClick={onSave} disabled={saving || backendStatus !== "ready"}>
              <Save />
              {saving ? "Saving" : "Save"}
            </Button>
          </div>
        </header>

        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
