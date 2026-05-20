import fs from "node:fs/promises";
import path from "node:path";
import {
	AIMessage,
	type BaseMessage,
	HumanMessage,
} from "@langchain/core/messages";
import { getAppDir } from "@/config/paths";

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
	timestamp?: string;
}

export class SessionHistory {
	private filePath: string;

	constructor(chatId: string) {
		const sessionsDir = path.join(getAppDir(), "sessions", chatId);
		this.filePath = path.join(sessionsDir, "history.jsonl");
	}

	/**
	 * Loads recent message history as LangChain BaseMessages.
	 *
	 * @param limit The maximum number of recent messages to load
	 * @returns Array of LangChain messages (AIMessage / HumanMessage)
	 */
	async loadHistory(limit = 40): Promise<BaseMessage[]> {
		try {
			await fs.mkdir(path.dirname(this.filePath), { recursive: true });
			const content = await fs.readFile(this.filePath, "utf-8");
			const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

			// Take last N lines
			const recentLines = lines.slice(-limit);
			const messages: BaseMessage[] = [];

			for (const line of recentLines) {
				try {
					const msg: ChatMessage = JSON.parse(line);
					if (msg.role === "user") {
						messages.push(new HumanMessage(msg.content));
					} else if (msg.role === "assistant") {
						messages.push(new AIMessage(msg.content));
					}
				} catch {
					// Ignore corrupted lines
				}
			}

			return messages;
		} catch {
			// If file does not exist, return empty array
			return [];
		}
	}

	/**
	 * Appends a single chat message to the JSONL history file.
	 */
	async appendMessage(
		role: "user" | "assistant",
		content: string,
	): Promise<void> {
		try {
			await fs.mkdir(path.dirname(this.filePath), { recursive: true });
			const log: ChatMessage = {
				role,
				content,
				timestamp: new Date().toISOString(),
			};
			await fs.appendFile(this.filePath, `${JSON.stringify(log)}\n`, "utf-8");
		} catch (err: unknown) {
			console.error(
				`Failed to write session history: ${(err as Error).message}`,
			);
		}
	}

	/**
	 * Archives current history by renaming history.jsonl to history_<timestamp>.jsonl
	 */
	async archiveHistory(): Promise<void> {
		try {
			await fs.access(this.filePath);
			const sessionsDir = path.dirname(this.filePath);
			const timestamp = Math.floor(Date.now() / 1000);
			const archivePath = path.join(sessionsDir, `history_${timestamp}.jsonl`);
			await fs.rename(this.filePath, archivePath);
		} catch {
			// history.jsonl does not exist or cannot be accessed, nothing to archive
		}
	}

	/**
	 * Clears only the active session history file (history.jsonl).
	 */
	async clearHistory(): Promise<void> {
		try {
			await fs.rm(this.filePath, { force: true });
		} catch (err: unknown) {
			console.error(
				`Failed to clear session history: ${(err as Error).message}`,
			);
		}
	}
}

export const ContextEngineeringManager = {
	/**
	 * Loads global memory files (e.g. AGENTS.md in the active workspace and ~/.miniclaw/preferences.md)
	 * and returns them formatted as a guidelines block for the system prompt.
	 */
	async loadMemoryFiles(workspaceDir: string): Promise<string> {
		const guidelines: string[] = [];

		// 1. Load AGENTS.md from the active workspace
		try {
			const agentsPath = path.resolve(workspaceDir, "AGENTS.md");
			const content = await fs.readFile(agentsPath, "utf-8");
			guidelines.push(`### WORKSPACE MEMORY (AGENTS.md):\n${content}`);
		} catch {
			// Ignore if not present in the workspace
		}

		// 2. Load preferences.md from the ~/.miniclaw folder
		try {
			const prefPath = path.join(getAppDir(), "preferences.md");
			const content = await fs.readFile(prefPath, "utf-8");
			guidelines.push(`### USER PREFERENCES (preferences.md):\n${content}`);
		} catch {
			// Ignore if not present
		}

		if (guidelines.length === 0) {
			return "";
		}

		return `\n## PERSISTENT CONTEXT & ALIGNMENT GUIDELINES:\n${guidelines.join("\n\n")}\n`;
	},
};
