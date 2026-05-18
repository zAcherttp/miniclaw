import type { MiniclawConfig, ProviderItemConfig } from "@miniclaw/shared";

import { Field, SelectInput, TextInput } from "../../components/layout/Field";

type ProvidersViewProps = {
  config: MiniclawConfig;
  onChange: (config: MiniclawConfig) => void;
};

const defaultProvider: ProviderItemConfig = {
  kind: "openai-compatible",
  apiKey: "${OPENROUTER_API_KEY}",
  baseUrl: "https://openrouter.ai/api/v1",
  model: null,
};

export function ProvidersView({ config, onChange }: ProvidersViewProps) {
  const activeProvider = config.providers.activeProvider ?? "openrouter";
  const provider = config.providers.items[activeProvider] ?? defaultProvider;

  function updateProvider(next: ProviderItemConfig) {
    onChange({
      ...config,
      providers: {
        activeProvider,
        items: {
          ...config.providers.items,
          [activeProvider]: next,
        },
      },
    });
  }

  return (
    <SettingsSection
      title="LLM provider"
      description="Store provider selection and secret references. Runtime calls are introduced in Phase 2."
    >
      <Field label="Active provider">
        <TextInput
          value={activeProvider}
          onChange={(event) =>
            onChange({
              ...config,
              providers: {
                ...config.providers,
                activeProvider: event.currentTarget.value || null,
              },
            })
          }
        />
      </Field>
      <Field
        label="Provider kind"
        description="OpenAI-compatible covers OpenRouter, OpenAI, Azure-compatible gateways, and local proxies. Ollama runs locally."
      >
        <SelectInput
          value={provider.kind}
          onChange={(event) =>
            updateProvider({
              ...provider,
              kind: event.currentTarget.value === "ollama" ? "ollama" : "openai-compatible",
              apiKey:
                event.currentTarget.value === "ollama"
                  ? null
                  : (provider.apiKey ?? "${OPENROUTER_API_KEY}"),
              baseUrl:
                event.currentTarget.value === "ollama"
                  ? (provider.baseUrl ?? "http://127.0.0.1:11434")
                  : provider.baseUrl,
            })
          }
        >
          <option value="openai-compatible">OpenAI-compatible</option>
          <option value="ollama">Ollama</option>
        </SelectInput>
      </Field>
      <Field
        label="API key reference"
        description="Use an environment reference such as ${OPENROUTER_API_KEY}."
      >
        <TextInput
          value={provider.apiKey ?? ""}
          onChange={(event) =>
            updateProvider({ ...provider, apiKey: event.currentTarget.value || null })
          }
          disabled={provider.kind === "ollama"}
        />
      </Field>
      <Field label="Model">
        <TextInput
          placeholder="anthropic/claude-sonnet-4-5"
          value={provider.model ?? ""}
          onChange={(event) =>
            updateProvider({ ...provider, model: event.currentTarget.value || null })
          }
        />
      </Field>
      <Field label="Base URL">
        <TextInput
          placeholder={
            provider.kind === "ollama"
              ? "http://127.0.0.1:11434"
              : "Optional OpenAI-compatible endpoint"
          }
          value={provider.baseUrl ?? ""}
          onChange={(event) =>
            updateProvider({ ...provider, baseUrl: event.currentTarget.value || null })
          }
        />
      </Field>
    </SettingsSection>
  );
}

function SettingsSection({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="grid max-w-2xl gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}
