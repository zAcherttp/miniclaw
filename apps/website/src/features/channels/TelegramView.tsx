import type { MiniclawConfig, TelegramGroupPolicy, TelegramMode } from "@miniclaw/shared";

import { CheckboxField, Field, SelectInput, TextInput } from "../../components/layout/Field";

type TelegramViewProps = {
  config: MiniclawConfig;
  onChange: (config: MiniclawConfig) => void;
};

export function TelegramView({ config, onChange }: TelegramViewProps) {
  const telegram = config.channels.telegram;

  function updateTelegram(patch: Partial<typeof telegram>) {
    onChange({
      ...config,
      channels: {
        ...config.channels,
        telegram: {
          ...telegram,
          ...patch,
        },
      },
    });
  }

  return (
    <section className="grid max-w-2xl gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Telegram channel</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Telegram is the first user interaction channel. Phase 1 stores config only.
        </p>
      </div>

      <div className="grid gap-4">
        <CheckboxField
          label="Enable Telegram"
          description="Polling and webhook runtime are implemented in a later phase."
          checked={telegram.enabled}
          onChange={(enabled) => updateTelegram({ enabled })}
        />
        <Field label="Mode">
          <SelectInput
            value={telegram.mode}
            onChange={(event) =>
              updateTelegram({ mode: event.currentTarget.value as TelegramMode })
            }
          >
            <option value="polling">Polling</option>
            <option value="webhook">Webhook</option>
          </SelectInput>
        </Field>
        <Field label="Bot token reference">
          <TextInput
            value={telegram.botToken ?? ""}
            onChange={(event) => updateTelegram({ botToken: event.currentTarget.value || null })}
          />
        </Field>
        <Field label="Allowed user IDs" description="Comma-separated Telegram user IDs.">
          <TextInput
            value={telegram.allowedUserIds.join(", ")}
            onChange={(event) =>
              updateTelegram({
                allowedUserIds: event.currentTarget.value
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
        <Field label="Group policy">
          <SelectInput
            value={telegram.groupPolicy}
            onChange={(event) =>
              updateTelegram({ groupPolicy: event.currentTarget.value as TelegramGroupPolicy })
            }
          >
            <option value="private-only">Private only</option>
            <option value="mention">Mention required</option>
          </SelectInput>
        </Field>
        <CheckboxField
          label="Stream progress"
          description="Channel adapter may stream short progress updates when useful."
          checked={telegram.streaming}
          onChange={(streaming) => updateTelegram({ streaming })}
        />
      </div>
    </section>
  );
}
