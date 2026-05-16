# Miniclaw Architecture Plan

## Project Vision

Miniclaw is a personal, self-hosted virtual assistant for daily schedule and task management.

Academic topic:

> Tích hợp LLM để phát triển trợ lý ảo giúp quản lý lịch trình và công việc hàng ngày

The product goal is a channel-first assistant that can be configured from a local dashboard, run continuously, connect to messaging channels, read and manage calendars, help the user plan work, and coordinate reminders or follow-up tasks.

The main target is personal use, but the backend should be built as if it can be deployed publicly: explicit configuration, durable storage, authentication, webhook support, and clear integration boundaries.

## Core Direction

Use the current TypeScript monorepo as the main runtime:

- `apps/website`: React dashboard using shadcn-style components.
- `apps/backend`: Hono backend for APIs, webhooks, streaming, and the agent runtime.
- `packages/*`: shared contracts, prompts, connectors, and reusable agent tooling.

Use LangGraph JS inside the backend for the agent orchestration. The reference project `E:\Web\nanobot\nanobot` should guide the assistant behavior, prompt style, tool philosophy, channel patterns, memory model, and streaming semantics, but Miniclaw should not depend on nanobot as a runtime.

## Reference From Nanobot

Borrow these ideas from nanobot:

- Short, direct assistant tone.
- "Solve by doing" operating style.
- Channel-aware formatting rules.
- Tool-call progress and streaming events.
- Session history and memory consolidation.
- Cron/reminder model.
- Telegram channel handling and message formatting.
- Skill-based behavior extension.
- WebSocket channel ideas may be considered later, but are not part of the primary app interaction model.

Key source areas in nanobot:

- `nanobot/templates/SOUL.md`
- `nanobot/templates/agent/identity.md`
- `nanobot/agent/loop.py`
- `nanobot/agent/runner.py`
- `nanobot/channels/telegram.py`
- `nanobot/cron/service.py`
- `nanobot/skills/cron/SKILL.md`
- `webui/src/lib/nanobot-client.ts`

## Proposed Repository Shape

```txt
apps/
  website/
    src/
      app/
      components/
      features/
      lib/
      hooks/

  backend/
    src/
      app.ts
      main.ts
      api/
      agent/
      channels/
      connectors/
      storage/
      security/
      jobs/

packages/
  shared/
    src/
      api.ts
      events.ts
      config.ts
      schemas.ts

  prompts/
    src/
      identity.ts
      runtime.ts
      channel-format.ts
      planning.ts

  connectors/
    src/
      calendar/
      messaging/

  agent-tools/
    src/
      calendar.ts
      tasks.ts
      memory.ts
      reminders.ts
      messages.ts
```

## Backend Architecture

The Hono backend should expose local and public-safe APIs:

```txt
apps/backend/src/
  app.ts
  main.ts

  api/
    routes.health.ts
    routes.config.ts
    routes.agent.ts
    routes.channels.ts
    routes.connectors.ts
    routes.calendar.ts
    routes.logs.ts

  agent/
    graph.ts
    state.ts
    prompts.ts
    runtime.ts
    events.ts
    approvals.ts

  channels/
    telegram.ts
    registry.ts

  connectors/
    calendar/
      gws.ts
      lark.ts
      types.ts
    filesystem.ts

  storage/
    db.ts
    schema.ts
    repositories.ts

  security/
    auth.ts
    secrets.ts
```

Backend responsibilities:

- Serve dashboard API.
- Store local configuration.
- Manage encrypted or environment-backed secrets.
- Run LangGraph agent sessions.
- Stream agent events to active channels and optionally to dashboard observers.
- Receive Telegram webhook updates or run Telegram polling in local mode.
- Wrap calendar connectors behind safe typed tools.
- Persist messages, tool calls, agent runs, tasks, reminders, and memory.
- Enforce approval gates for risky actions.

## Storage

Use SQLite for the first self-hosted version. It is easy to inspect, backup, and deploy for personal use.

Suggested tables:

- `settings`
- `providers`
- `channels`
- `connectors`
- `sessions`
- `messages`
- `agent_runs`
- `tool_calls`
- `approvals`
- `tasks`
- `reminders`
- `calendar_events_cache`
- `memories`
- `jobs`

Configuration secrets should support both:

- local encrypted storage for personal setup
- environment variable references for public deployment

Example:

```json
{
  "channels": {
    "telegram": {
      "botToken": "${TELEGRAM_BOT_TOKEN}"
    }
  },
  "providers": {
    "openrouter": {
      "apiKey": "${OPENROUTER_API_KEY}"
    }
  }
}
```

## Agent Architecture

Use LangGraph as an explicit state machine rather than a loose chatbot loop.

```txt
receive_message
  -> load_context
  -> classify_intent
  -> plan
  -> check_approval
  -> execute_tools
  -> reflect
  -> respond
  -> persist_memory
```

Core graph nodes:

- `load_context`: load user profile, calendar window, task state, recent sessions, memory.
- `classify_intent`: decide whether the request is chat, planning, calendar, reminder, task, or coordination.
- `plan`: produce a short execution plan when tools are needed.
- `check_approval`: pause for approval before writes or external sends.
- `execute_tools`: call safe typed tools.
- `reflect`: inspect tool results and decide if more action is needed.
- `respond`: produce channel-appropriate output.
- `persist_memory`: save durable facts, preferences, and planning outcomes.

The graph should support interruption and resume, especially for approval flows.

## Agent Tools

Initial tool surface:

- `calendar_list_events`
- `calendar_create_event`
- `calendar_update_event`
- `calendar_delete_event`
- `task_capture`
- `task_prioritize`
- `task_update_status`
- `daily_plan`
- `weekly_review`
- `schedule_reminder`
- `send_message`
- `memory_search`
- `memory_write`

Calendar write tools should default to approval-required. The dashboard can later expose per-tool policy:

- always ask
- ask for external effects
- allow trusted low-risk operations

The agent should not call arbitrary shell commands for calendar operations. Calendar tools should call a typed connector wrapper.

## Calendar Connector

Start with Google Calendar through `gws` CLI.

Flow:

```txt
LangGraph tool
  -> calendar connector interface
  -> gws adapter
  -> validated command invocation
  -> structured parser
  -> typed result
```

Connector interface:

```ts
interface CalendarConnector {
  listEvents(input: ListEventsInput): Promise<ListEventsResult>;
  createEvent(input: CreateEventInput): Promise<CreateEventResult>;
  updateEvent(input: UpdateEventInput): Promise<UpdateEventResult>;
  deleteEvent(input: DeleteEventInput): Promise<DeleteEventResult>;
}
```

Future connectors:

- Lark Calendar
- direct Google Calendar API
- CalDAV
- Outlook Calendar

## Messaging Channels

Telegram should be the first channel.

Config shape:

```ts
type TelegramConfig = {
  enabled: boolean;
  mode: "polling" | "webhook";
  botToken: string;
  allowedUserIds: string[];
  streaming: boolean;
  groupPolicy: "private-only" | "mention";
};
```

Modes:

- `polling`: best for local self-hosting without public URL.
- `webhook`: best for public deployment.

Channel responsibilities:

- Normalize inbound messages into agent events.
- Attach channel metadata.
- Render responses for Telegram formatting limits.
- Split long messages safely.
- Support proactive reminders.
- Surface tool progress only when useful.

## Frontend Dashboard

The dashboard should feel like an operational control surface, not a marketing page. Its primary job is configuration, supervision, approvals, and logs. Day-to-day user interaction should happen through channels, starting with Telegram.

Primary navigation:

- Overview
- Agent Monitor
- Schedule
- Tasks
- Channels
- Connectors
- LLM Providers
- Skills & Prompts
- Memory
- Logs

Sidebar sections:

```txt
Workspace
  Overview
  Agent Monitor
  Schedule
  Tasks

Configuration
  LLM Providers
  Channels
    Telegram
  Connectors
    Google Calendar
    Lark
  Skills & Prompts

System
  Memory
  Logs
  Settings
```

Main dashboard surfaces:

- Current agent status.
- Active run transcript when available.
- Pending approvals.
- Today timeline.
- Upcoming calendar events.
- Captured tasks.
- Channel health.
- Connector health.
- Recent tool calls.

Use shadcn-style components:

- `Sidebar`
- `Button`
- `Input`
- `Textarea`
- `Select`
- `Switch`
- `Tabs`
- `Dialog`
- `Sheet`
- `Badge`
- `Table`
- `ScrollArea`
- `Tooltip`
- `Command`

Avoid a card-heavy dashboard. Use a dense but readable layout with side navigation, tables, status rows, segmented settings, and focused detail panels.

## Channel Runtime UX

The main user-facing interaction path is a messaging channel. Telegram is the first-class channel for user requests, proactive reminders, approvals, and final responses.

The dashboard may show the agent as a running process for supervision:

- connection status
- active model/provider
- current graph node
- streamed assistant text
- tool call started
- tool call result
- approval requested
- approval accepted/rejected
- final response
- persisted memory/task/reminder

Event model:

```ts
type AgentEvent =
  | { type: "run.started"; runId: string }
  | { type: "node.started"; node: string }
  | { type: "text.delta"; text: string }
  | { type: "tool.started"; tool: string; input: unknown }
  | { type: "tool.completed"; tool: string; result: unknown }
  | { type: "approval.requested"; approvalId: string; summary: string }
  | { type: "approval.resolved"; approvalId: string; approved: boolean }
  | { type: "run.completed"; runId: string }
  | { type: "run.failed"; runId: string; error: string };
```

Prefer channel adapters for normal interaction. A WebSocket channel for the web UI can be considered later if browser-based chat, interrupts, or live approval flows become important, but it is not required for the MVP.

## Prompt System

Port nanobot-style behavior into `packages/prompts`.

Base identity:

```txt
Miniclaw is a personal schedule and task coordination assistant.
It helps the user plan days, maintain calendars, track commitments,
prepare for upcoming events, and coordinate reminders across channels.
```

Core principles:

- Solve by doing, not by describing what would be done.
- Keep responses short unless depth is asked for.
- Say what is known and flag uncertainty.
- Treat the user's time as scarce.
- Prefer reading current calendar/task state before planning.
- Ask before making calendar changes unless policy allows it.
- Keep messaging app responses compact.

Channel formatting:

- Dashboard: structured, can show tool traces and approvals.
- Telegram: short paragraphs, minimal markdown, no large tables.
- Future SMS/WhatsApp: plain text.
- Email: simple sections.

## Security And Public Deployment Readiness

Even for personal use, the backend should assume it may be reachable from the internet.

Required controls:

- Dashboard auth token or password.
- CSRF-safe session strategy if cookies are used.
- Telegram allowlist by user ID.
- Webhook secret validation.
- Secret redaction in logs and UI.
- Approval gates for external effects.
- Safe connector wrappers instead of arbitrary command execution.
- CORS restricted by config.
- Rate limits for public endpoints.
- Health endpoint with no sensitive data.

## MVP Scope

First useful version:

- Configure LLM provider.
- Configure Telegram bot.
- Configure Google Calendar via `gws`.
- Chat with the agent through Telegram.
- Ask the agent to plan the day.
- Read upcoming calendar events.
- Create or update calendar events with approval.
- Receive Telegram reminders.
- Persist session history and basic memory.

MVP excluded:

- Multi-user teams.
- Complex OAuth account management.
- Full plugin marketplace.
- Multiple messaging channels beyond Telegram.
- Direct Google Calendar API unless `gws` is not sufficient.

## Implementation Phases

### Phase 1: Foundation

- Add shared schemas package.
- Add backend configuration model.
- Add SQLite storage.
- Add dashboard shell with sidebar.
- Add health/config APIs.

### Phase 2: Agent Runtime

- Add LangGraph dependency.
- Build minimal graph with chat, context load, response, and persistence.
- Add streaming events.
- Add dashboard agent monitor.
- Port core prompts from nanobot behavior.

### Phase 3: Calendar Tools

- Add calendar connector interface.
- Implement `gws` adapter.
- Add read-only calendar listing.
- Add daily planning workflow.
- Cache recent calendar events.

### Phase 4: Approval And Writes

- Add approval table and dashboard approval UI.
- Add calendar create/update/delete tools.
- Require approval for calendar writes.
- Show calendar diffs before confirmation.

### Phase 5: Telegram Channel

- Add Telegram config screen.
- Add polling mode.
- Add webhook endpoint.
- Add inbound Telegram normalization.
- Add proactive reminder delivery.

### Phase 6: Tasks, Memory, And Reminders

- Add task storage and task tools.
- Add reminder scheduler.
- Add memory search/write.
- Add daily and weekly review workflows.

### Phase 7: Hardening

- Add auth and secret redaction.
- Add logs view.
- Add connector health checks.
- Add tests for API routes, tools, and graph nodes.
- Add deployment documentation.

## Validation

Use the Vite+ workflow:

```bash
vp install
vp check
vp test
vp run -r build
```

For docs-only edits, running the full validation is optional, but code changes should go through the full checklist.
