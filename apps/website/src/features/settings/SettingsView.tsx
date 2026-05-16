import type { MiniclawConfig } from "@miniclaw/shared";

import { CheckboxField, Field, TextInput } from "../../components/layout/Field";

type SettingsViewProps = {
  config: MiniclawConfig;
  onChange: (config: MiniclawConfig) => void;
};

export function SettingsView({ config, onChange }: SettingsViewProps) {
  return (
    <section className="grid max-w-2xl gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Server settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Configure local server basics. Public deployment hardening continues in later phases.
        </p>
      </div>

      <div className="grid gap-4">
        <Field label="Host">
          <TextInput
            value={config.server.host}
            onChange={(event) =>
              onChange({
                ...config,
                server: { ...config.server, host: event.currentTarget.value },
              })
            }
          />
        </Field>
        <Field label="Port">
          <TextInput
            type="number"
            min={1}
            max={65535}
            value={config.server.port}
            onChange={(event) =>
              onChange({
                ...config,
                server: { ...config.server, port: Number(event.currentTarget.value) },
              })
            }
          />
        </Field>
        <Field label="Public base URL">
          <TextInput
            placeholder="https://miniclaw.example.com"
            value={config.server.publicBaseUrl ?? ""}
            onChange={(event) =>
              onChange({
                ...config,
                server: { ...config.server, publicBaseUrl: event.currentTarget.value || null },
              })
            }
          />
        </Field>
        <CheckboxField
          label="Enable dashboard auth"
          description="Auth enforcement is planned for a hardening phase."
          checked={config.dashboard.authEnabled}
          onChange={(authEnabled) =>
            onChange({
              ...config,
              dashboard: { ...config.dashboard, authEnabled },
            })
          }
        />
      </div>
    </section>
  );
}
