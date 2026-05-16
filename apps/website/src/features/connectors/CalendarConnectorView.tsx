import type { CalendarConnectorsConfig, MiniclawConfig } from "@miniclaw/shared";

import { CheckboxField, Field, SelectInput, TextInput } from "../../components/layout/Field";

type CalendarConnectorViewProps = {
  config: MiniclawConfig;
  onChange: (config: MiniclawConfig) => void;
};

export function CalendarConnectorView({ config, onChange }: CalendarConnectorViewProps) {
  const calendar = config.connectors.calendar;

  function updateCalendar(patch: Partial<CalendarConnectorsConfig>) {
    onChange({
      ...config,
      connectors: {
        ...config.connectors,
        calendar: {
          ...calendar,
          ...patch,
        },
      },
    });
  }

  return (
    <section className="grid max-w-2xl gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calendar connector</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Store connector settings for Google Calendar through gws. Tool execution comes later.
        </p>
      </div>

      <div className="grid gap-4">
        <Field label="Active connector">
          <SelectInput
            value={calendar.activeConnector ?? "gws"}
            onChange={(event) =>
              updateCalendar({
                activeConnector: event.currentTarget
                  .value as CalendarConnectorsConfig["activeConnector"],
              })
            }
          >
            <option value="gws">gws</option>
            <option value="lark">Lark</option>
          </SelectInput>
        </Field>
        <CheckboxField
          label="Enable gws"
          description="The connector wrapper will call this command in a later phase."
          checked={calendar.gws.enabled}
          onChange={(enabled) => updateCalendar({ gws: { ...calendar.gws, enabled } })}
        />
        <Field label="gws command">
          <TextInput
            value={calendar.gws.command}
            onChange={(event) =>
              updateCalendar({ gws: { ...calendar.gws, command: event.currentTarget.value } })
            }
          />
        </Field>
      </div>
    </section>
  );
}
