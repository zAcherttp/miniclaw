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

Miniclaw relies on `gws` and `lark-cli` to perform actions in Google Workspace and Lark. Ensure they are installed and authenticated before starting the bot.

### 1. Google Workspace CLI (`gws`)

`gws` is a tool-agent-native CLI for Google Workspace APIs. Refer to the [gws installation documentation](https://github.com/googleworkspace/cli#installation) for more details.

#### Installation Options

Choose **one** of the following methods to install `gws`:

- **Using NPM (Recommended — downloads pre-built binary):**
  ```bash
  npm install -g @googleworkspace/cli
  ```
- **Using Homebrew (macOS & Linux):**
  ```bash
  brew install googleworkspace-cli
  ```
- **From Source (Cargo):**
  ```bash
  cargo install --git https://github.com/googleworkspace/cli --locked
  ```
- **Using Nix Flakes:**
  ```bash
  nix run github:googleworkspace/cli
  ```

#### Authentication Setup

Once installed, authenticate `gws` using **one** of the following workflows:

- **Interactive Local Desktop (Fastest — requires `gcloud` installed & logged in):**
  ```bash
  gws auth setup
  ```
  This command creates a Google Cloud project, enables Workspace APIs, and authenticates your account.
  
- **Manual OAuth Setup (No `gcloud`):**
  1. Open the [Google Cloud Console](https://console.cloud.google.com/).
  2. Create a project and configure the OAuth consent screen as **External** (testing mode is fine).
  3. Under **Test users**, click **Add users** and add your Google account email.
  4. Navigate to **Credentials** -> **Create credentials** -> **OAuth client ID** -> select **Desktop app**.
  5. Download the client secret JSON file and save it to `~/.config/gws/client_secret.json`.
  6. Perform login:
     ```bash
     gws auth login
     ```

---

### 2. Lark Suite CLI (`lark-cli`)

`lark-cli` is the official command-line tool for Lark/Feishu. Refer to the [lark-cli quick start documentation](https://github.com/larksuite/cli#installation--quick-start) for more details.

#### Installation Options

Choose **one** of the following methods to install `lark-cli`:

- **Using NPM (Recommended):**
  ```bash
  npx @larksuite/cli@latest install
  ```
- **From Source (requires Go 1.23+ and Python 3):**
  ```bash
  git clone https://github.com/larksuite/cli.git
  cd cli
  make install
  ```

#### Authentication Setup

Authenticate your client by running:
```bash
lark auth login
```
Follow the interactive prompt in your terminal and browser to select your Lark organization/tenant and authorize scope requests.

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
   - Miniclaw will create its configuration at `~/.config/miniclaw/config.json`.
   - You will be asked if you want to include custom skills directories. Paths can be absolute, relative (resolved against the workspace directory), or home-expanded (using `~`).
   - Template skills suite will be automatically cloned to your configured workspace `skills` folder.
   - An environment file template `.env` will be generated at `~/.config/miniclaw/.env`. Open it and populate your credentials (such as `TELEGRAM_BOT_TOKEN`, API keys, etc.).

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

- `/clear` — Cancels any active model execution and wipes the current chat history completely (archived history remains preserved).
- `/compact` — Manually compacts the active conversation history, running memory profiling and workflow skill extraction.
- `/stop` — Gracefully interrupts and stops the active model execution loop.
- `/status` — Displays current status of the model, active session properties, and workspace config.
- `/help` — Renders the commands guide menu.
