# MiniClaw

MiniClaw is a local-first personal AI assistant daemon built for **Course Project 1**. It runs as a Telegram bot and CLI app, using LangGraph, TypeScript, and a secure tool harness to help manage schedules, reminders, tasks, files, and external office tools.

Project topic: **Integrating LLMs to Develop a Virtual Assistant for Daily Schedule and Task Management**.

## Features

- Telegram bot interface for daily interaction.
- LangGraph-based ReAct agent loop.
- Short-term checkpoints and long-term semantic memory.
- Reminder scheduler that can send outbound Telegram notifications.
- Dynamic `SKILL.md` loading for tool and workflow instructions.
- Human-in-the-loop workflow extraction during context compaction.
- Secure file boundary checks and allow-listed command execution.
- Optional integrations through Google Workspace CLI (`gws`) and Lark CLI (`lark-cli`).

## Prerequisites

- Node.js 20+
- npm
- Git
- Telegram bot token from BotFather
- Optional: Ollama or cloud LLM API keys
- Optional: authenticated `gws` and `lark-cli` for office integrations

## Setup

```bash
git clone <repository_url>
cd miniclaw
npm install
npm run dev -- init
```

After initialization, edit the generated files under `~/.miniclaw`:

- `.env`: add Telegram and model credentials.
- `config.json`: enable Telegram, set `allowFrom`, model, workspace, and skill directories.

Start MiniClaw:

```bash
npm run dev -- start
```

View the current configuration:

```bash
npm run dev -- config
```

Run tests:

```bash
npm test
```

## Telegram Commands

- `/help`: show available commands.
- `/status`: show current bot and session status.
- `/stop`: stop the active agent run.
- `/compact`: compact the current conversation context.
- `/clear`: clear the current chat history.

## Data Directory

MiniClaw stores user configuration and runtime state in `~/.miniclaw`:

```text
~/.miniclaw/
├── config.json
├── .env
├── state.json
├── workspace/
└── sessions/
```

## License

This repository is maintained for academic project work.
