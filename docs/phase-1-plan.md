# Phase 1 Plan: Foundation

## Goal

Phase 1 creates the foundation that later phases can build on without reworking core boundaries.

By the end of Phase 1, Miniclaw should have:

- a shared contract package for config and API types
- a backend configuration model
- a local persistence layout
- basic Hono routes for health and config
- a dashboard shell with sidebar navigation
- a clear validation path through Vite+

Phase 1 should not include LangGraph, Telegram runtime, calendar tools, or LLM calls. Those belong to later phases.

## Architecture Decisions

### Storage

Use a hybrid local storage model:

- SQLite for canonical app state that needs querying, indexing, and atomic updates.
- JSON for user-editable config.
- JSONL for append-only debug and event logs.

Initial layout:

```txt
.miniclaw/
  config.json
  miniclaw.db
  logs/
    app-events.jsonl
    channel-events.jsonl
    agent-events.jsonl
  exports/
```

The default data directory should be configurable with `MINICLAW_HOME`.

Resolution order:

1. `MINICLAW_HOME`
2. repo-local `.miniclaw` in development
3. user home directory later, for packaged/self-hosted install

### Config

Config should be easy to inspect and edit. Keep it in JSON, validate it with shared schemas, and allow secret values to reference environment variables.

Example:

```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 3001,
    "publicBaseUrl": null
  },
  "dashboard": {
    "authEnabled": false
  },
  "providers": {
    "activeProvider": null,
    "items": {}
  },
  "channels": {
    "telegram": {
      "enabled": false,
      "mode": "polling",
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "allowedUserIds": [],
      "streaming": true,
      "groupPolicy": "private-only"
    }
  },
  "connectors": {
    "calendar": {
      "activeConnector": "gws",
      "gws": {
        "enabled": false,
        "command": "gws"
      }
    }
  }
}
```

Do not store real secrets in git. Phase 1 only needs secret references and redacted API responses.

### Shared Contracts

Create one shared package that both backend and website can import.

Suggested package:

```txt
packages/shared/
  package.json
  tsconfig.json
  src/
    index.ts
    config.ts
    api.ts
    events.ts
```

Core exports:

- `MiniclawConfig`
- `ServerConfig`
- `DashboardConfig`
- `ProviderConfig`
- `TelegramChannelConfig`
- `CalendarConnectorConfig`
- `HealthResponse`
- `ConfigResponse`
- `UpdateConfigRequest`
- `AgentEvent`

Use Zod if available or added during implementation. If avoiding a new dependency in the first pass, define TypeScript types first and add runtime validation before config writes.

## Backend Scope

### File Structure

Target backend structure:

```txt
apps/backend/src/
  app.ts
  main.ts
  api/
    routes.health.ts
    routes.config.ts
  config/
    defaults.ts
    loader.ts
    redact.ts
  storage/
    paths.ts
    json-file.ts
    logs.ts
    db.ts
  security/
    secrets.ts
```

### Routes

Add these routes:

```txt
GET  /health
GET  /api/config
PUT  /api/config
GET  /api/system/paths
```

`GET /health`:

```json
{
  "ok": true,
  "name": "miniclaw-backend",
  "version": "0.0.0"
}
```

`GET /api/config` should return redacted config:

```json
{
  "config": {},
  "meta": {
    "path": "...",
    "secretsRedacted": true
  }
}
```

`PUT /api/config` should:

- validate request shape
- merge config conservatively
- write atomically
- return redacted config

`GET /api/system/paths` should return non-secret local paths:

```json
{
  "home": "...",
  "configPath": "...",
  "databasePath": "...",
  "logsPath": "..."
}
```

### Persistence

Phase 1 only needs storage primitives:

- resolve home/data paths
- ensure directories exist
- load config or create defaults
- atomic JSON write
- append JSONL log entry
- initialize SQLite database file

SQLite schema can start minimal:

```sql
CREATE TABLE IF NOT EXISTS migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
```

Full app tables can wait until their feature phases.

## Frontend Scope

### File Structure

Target website structure:

```txt
apps/website/src/
  main.tsx
  app/
    App.tsx
    navigation.ts
  features/
    overview/
      OverviewView.tsx
    providers/
      ProvidersView.tsx
    channels/
      TelegramView.tsx
    connectors/
      CalendarConnectorView.tsx
    settings/
      SettingsView.tsx
  components/
    layout/
      AppShell.tsx
      SidebarNav.tsx
      TopBar.tsx
  lib/
    api.ts
```

### Views

Phase 1 dashboard views:

- Overview
- LLM Providers
- Channels / Telegram
- Connectors / Calendar
- Settings

Views can use mocked or config-backed data. They should not pretend the agent is running yet.

Overview should show:

- backend connection status
- configured provider status
- Telegram enabled/disabled
- calendar connector enabled/disabled
- local data path

Telegram view should expose configuration fields:

- enabled
- mode: polling/webhook
- bot token reference
- allowed user IDs
- streaming
- group policy

Calendar connector view should expose:

- active connector
- `gws` enabled
- `gws` command path
- future Lark placeholder disabled

Provider view should expose:

- active provider
- provider API key reference
- model name
- base URL where applicable

### UI Direction

Use a restrained operational layout:

- persistent sidebar
- compact top bar
- dense forms
- status rows
- no landing-page hero
- no decorative dashboard card grid

Cards are acceptable for individual setting groups, but avoid nesting cards or turning every page section into a floating panel.

## Package Work

### Root Workspace

Add `packages/shared` to the workspace if needed.

### Dependencies

Likely additions:

- backend: SQLite driver, probably `better-sqlite3` or a compatible alternative
- shared/backend: `zod` for runtime validation

Before adding dependencies, check Vite+ catalog conventions and use the existing package manager flow.

## Testing

Phase 1 tests should cover:

- config defaults load correctly
- config redaction hides secret-like fields
- config merge rejects invalid shapes
- path resolution respects `MINICLAW_HOME`
- health route returns expected JSON
- config route returns redacted config

Frontend tests can wait unless the repo already has a frontend test setup. At minimum, TypeScript build should catch component errors.

## Validation

Use Vite+:

```bash
vp install
vp check
vp test
vp run -r build
```

If tests do not exist yet for a package, add focused tests where the new behavior has risk: config loading, redaction, route behavior, and path resolution.

## Deliverables

Phase 1 is complete when:

- `packages/shared` exists and exports config/API contracts.
- Backend loads default config from local storage.
- Backend can read/update redacted config through Hono routes.
- Backend initializes the local data directory.
- Backend can append JSONL app events.
- SQLite database file initializes with migrations metadata.
- Website has a real app shell with sidebar navigation.
- Website reads backend config and displays foundation settings.
- Validation passes with Vite+.

## Non-Goals

Do not implement these in Phase 1:

- LangGraph runtime
- LLM provider calls
- Telegram bot polling or webhooks
- calendar connector execution
- approvals
- task/reminder scheduling
- memory consolidation
- browser chat/WebSocket channel

## Suggested Implementation Order

1. Create shared package and config contracts.
2. Add backend path resolution and config defaults.
3. Add JSON config load/write/redaction.
4. Add JSONL log helper.
5. Add SQLite initialization with minimal migrations table.
6. Add health/config/system path routes.
7. Replace website starter screen with app shell/sidebar.
8. Add config-backed settings views.
9. Add focused backend tests.
10. Run Vite+ validation.
