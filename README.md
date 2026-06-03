# Miniclaw

Miniclaw is a persistent, tool-first personal AI assistant daemon and Telegram bot built with [LangChain](https://github.com/langchain-ai/langchainjs) and [LangGraph](https://github.com/langchain-ai/langgraphjs). It is designed to run in a safe local workspace environment, executing secure commands, managing tasks, and interactively mining reusable workflow skills from conversation history.

---

## Key Features

- 🤖 **Telegram Bot Interface** — Rich, responsive chat interface with expandable tool logs, reasoning details, and execution timing.
- 🔄 **Human-in-the-Loop Workflow Consolidation** — Analyzes message histories during compaction to propose reusable workflow routines. Allows users to review, edit, and confirm saving these workflows as new modular skills.
- ⚙️ **Modular Skills & Workflows** — Dynamically loads custom guidelines and instructions (`SKILL.md`) from configured directories, automatically injecting the top 10 most used workflows/skills into the prompt.
- 🗜️ **Unified Compaction Pipeline** — Compacts chat histories using LLM-based summarization (via daily auto-cron or manual `/compact`), refining user traits, timezone inferences, and long-term goals.
- ⏰ **Background Task Scheduler** — Out-of-band daemon that schedules and triggers user alerts and reminders, programmatically dispatching notifications back to the last active Telegram chat.
- 🛡️ **Boundary Security** — Strict path-traversal prevention (`resolveSecurePath`) and a command execution whitelist allowing only verified platform tools.

---

## Prerequisites

Before setting up Miniclaw, ensure you have:

- **Node.js 18+** & **PNPM** installed on your host system.
- A local LLM runner (e.g. [Ollama](https://ollama.com/)) or API keys for commercial providers (OpenAI, Google Gemini).
- Installed and authenticated command-line interfaces for your target platforms:
  - **Google Workspace CLI (`gws`)** — for Drive, Sheets, Gmail, Calendar, and Chat.
  - **Lark Suite CLI (`lark-cli`)** — for Lark/Feishu Messenger, Base, Sheets, Calendar, Mail, Tasks, and Wiki.

---

## Platform Setup & Installation

Miniclaw relies on `gws` and `lark-cli` to perform actions in Google Workspace and Lark.

- **Google Workspace CLI (`gws`)**: A tool-agent-native CLI for Google Workspace APIs. Follow the [gws installation and authentication setup guide](https://github.com/googleworkspace/cli#installation).
- **Lark Suite CLI (`lark-cli`)**: The official CLI for Lark/Feishu. Follow the [lark-cli quick start and login guide](https://github.com/larksuite/cli#installation--quick-start).

---

## Codebase Directory Structure

Here is a tree overview of Miniclaw's codebase directory structure along with the functions of the respective files:

```text
miniclaw/
├── config.json                     # Main user settings configuration (auto-created at `~\.miniclaw\config.json` on init)
├── .env.example                    # Template environment file
├── index.ts                        # Main entry point (starts the application CLI)
├── tsconfig.json                   # TypeScript project configuration
├── vitest.config.ts                # Vitest unit test configuration
└── src/                            # Application source files
    ├── index.ts                    # Alternative main/sub module entry
    ├── bus/                        # Out-of-band communication pipeline
    │   ├── message.ts              # Inbound/Outbound message schemas and types
    │   └── queue.ts                # Asynchronous queue-based MessageBus implementation
    ├── channels/                   # External chat interface connectors
    │   ├── base.ts                 # Base Channel abstract class (handling allow-lists & permissions)
    │   ├── manager.ts              # ChannelManager dispatching inbound/outbound streams across platforms
    │   └── telegram.ts             # TelegramChannel adapter (via Grammy) with formatting & menu commands
    ├── cli/                        # Command-line interface commands definitions
    │   └── commands.ts             # Commander.js setup for init, start, onboarding, and configuration
    ├── config/                     # Configuration schema and loading utilities
    │   ├── loader.ts               # Safely loads/saves JSON configs & loads dotenv
    │   ├── paths.ts                # Single source of truth for resolution of app directories (e.g. `~\.miniclaw`)
    │   └── schema.ts               # Zod schemas validating configuration settings
    ├── scripts/                    # Developer helper scripts
    │   └── print-system-prompt.ts  # Compiles and outputs prompt/tools statistics without making API calls
    ├── template/                   # Default configuration templates cloned on initialization
    │   ├── AGENTS.md               # Default guidelines template copied to workspace
    │   ├── env.template            # Default env variables template copied as .env
    │   └── skills/                 # Default SKILL.md templates copied to workspace on onboarding
    ├── utils/                      # Core cross-functional utility functions
    │   ├── date.ts                 # ISO date stamp provider for daily cron logic
    │   ├── logger.ts               # Pino-pretty logger configuration
    │   └── retry.ts                # Exponential backoff delay calculator for queue retries
    └── agent/                      # Core LLM execution loop & LangGraph engine
        ├── agents.ts               # Compiles main agent and consolidation agent with tools
        ├── compaction.ts           # Summarization, profiling and workflow extraction manager
        ├── graph.ts                # Compiles the LangGraph execution graph (agent/tools nodes & conditional routing)
        ├── history.ts              # ContextEngineeringManager compiling guidelines (AGENTS.md, preferences.md)
        ├── loop.ts                 # AgentLoop processing message queue batches and checking daily crons
        ├── memory.ts               # Offline memory store (FactMemory retrieval and UserProfile state storage)
        ├── middleware.ts           # Summarization/remove-message middleware helpers
        ├── models.ts               # Universal chat model loader with custom provider configurations
        ├── observer.ts             # AgentEventObserver streaming real-time deltas and formatting tool execution hints
        ├── security.ts             # resolveSecurePath boundary checks & execute whitelisted command checks
        ├── store.ts                # FileCheckpointSaver serialization for thread checkpoints
        ├── tokenizer.ts            # Content-aware BPE token estimator for active compaction triggers
        └── tools/                  # Executable tools bound to the Agent
            ├── execute.ts          # Whitelisted local shell command runner (gws, lark-cli)
            ├── filesystem.ts       # Secure file actions (reading, writing, editing files)
            ├── memory.ts           # Remember/recall long-term facts & preferences
            ├── reminders.ts        # Manage background task scheduling (create, update, delete reminders)
            ├── skills.ts           # Discover/search dynamic skills & workflows catalog
            └── todos.ts            # Read/write todo checklists
```

---

## Application Data Directory Structure (`~/.miniclaw`)

Miniclaw initializes its persistent state, configuration, and session cache inside the user's home directory. Below is the file tree and description for `~/.miniclaw`:

```text
~/.miniclaw/
├── config.json                     # Generated settings (holds active model configurations and skills directory paths)
├── .env                            # Environment variables (API tokens, Telegram keys, model endpoints)
├── state.json                      # Persistent application state (skill usage statistics, cron markers, active requests)
├── workspace/                      # Safe local sandbox directory where agent operations/file tasks occur
│   ├── AGENTS.md                   # (Optional) Workspace alignment rules appended to system prompt
│   └── workflows/                  # Saved workflow skill confirmation directories
└── sessions/                       # Conversation checkpointer database directory
    └── <chat_id>/                  # Chat session subdirectory matching specific Telegram thread/user ID
        └── checkpoint.json         # Active serialized message thread history checkpoint
```



---

## Project Installation & Onboarding

1. Clone the Miniclaw repository:
   ```bash
   git clone <repository_url>
   cd miniclaw
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Initialize onboarding setup:
   ```bash
   pnpm run check    # Run linter and verify typescript settings
   pnpm dev init
   ```
   During the interactive initialization:
   - Miniclaw will create its configuration at `~\.miniclaw\config.json`.
   - You will be asked if you want to include custom skills directories. Paths can be absolute, relative (resolved against the workspace directory), or home-expanded (using `~`).
   - Template skills suite will be automatically cloned to your configured workspace `skills` folder.
   - An environment file template `.env` will be generated at `~\.miniclaw\.env`. Open it and populate your credentials (such as `TELEGRAM_BOT_TOKEN`, API keys, etc.).

---

## Running Miniclaw

- **Start in Development Mode:**
  ```bash
  pnpm run dev start
  ```
- **View Configuration:**
  ```bash
  pnpm run dev config
  ```
- **Run the Complete Test Suite:**
  ```bash
  pnpm exec vitest run
  ```
- **Run Style & Formatting Check:**
  ```bash
  pnpm run check
  ```

---

## Telegram Bot Commands

When chatting with Miniclaw over Telegram, the following commands are available in the menu:

- `/clear` — Cancels any active model execution and wipes the current chat history completely.
- `/compact` — Manually compacts the active conversation history, running memory profiling and workflow skill extraction.
- `/stop` — Gracefully interrupts and stops the active model execution loop.
- `/status` — Displays current status of the model, active session properties, and workspace config.
- `/help` — Renders the commands guide menu.
