import fs from "node:fs/promises";
import path from "node:path";
import {
	AIMessage,
	type BaseMessage,
	HumanMessage,
	SystemMessage,
	ToolMessage,
} from "@langchain/core/messages";
import { getAppDir } from "@/config/paths";

export interface SerializedMessage {
	type: string;
	// biome-ignore lint/suspicious/noExplicitAny: content can be a string or array of complex objects
	content: string | any[];
	name?: string;
	id?: string;
	// biome-ignore lint/suspicious/noExplicitAny: additional_kwargs is arbitrary metadata
	additional_kwargs?: Record<string, any>;
	// biome-ignore lint/suspicious/noExplicitAny: tool_calls is structured but dynamic JSON from model
	tool_calls?: any[];
	tool_call_id?: string;
}

export function serializeMessage(message: BaseMessage): SerializedMessage {
	const res: SerializedMessage = {
		type: message.type,
		content: message.content,
	};
	if (message.name) res.name = message.name;
	if (message.id) res.id = message.id;
	if (
		message.additional_kwargs &&
		Object.keys(message.additional_kwargs).length > 0
	) {
		res.additional_kwargs = message.additional_kwargs;
	}
	// biome-ignore lint/suspicious/noExplicitAny: cast to check tool_calls property
	if ("tool_calls" in message && Array.isArray((message as any).tool_calls)) {
		// biome-ignore lint/suspicious/noExplicitAny: cast to read tool_calls property
		res.tool_calls = (message as any).tool_calls;
	}
	if (
		"tool_call_id" in message &&
		// biome-ignore lint/suspicious/noExplicitAny: cast to check tool_call_id property
		typeof (message as any).tool_call_id === "string"
	) {
		// biome-ignore lint/suspicious/noExplicitAny: cast to read tool_call_id property
		res.tool_call_id = (message as any).tool_call_id;
	}
	return res;
}

export function deserializeMessage(data: SerializedMessage): BaseMessage {
	const fields = {
		content: data.content,
		name: data.name,
		id: data.id,
		additional_kwargs: data.additional_kwargs,
	};

	switch (data.type) {
		case "human":
			return new HumanMessage(fields);
		case "ai":
			return new AIMessage({
				...fields,
				tool_calls: data.tool_calls,
			});
		case "system":
			return new SystemMessage(fields);
		case "tool":
			return new ToolMessage({
				...fields,
				tool_call_id: data.tool_call_id || "",
			});
		default:
			return new HumanMessage(fields);
	}
}

/**
 * A persistent file-based session store for LangChain messages.
 * Serializes checkpoints/writes directly to the session directory.
 */
export class FileCheckpointSaver {
	private filePath: string;
	public messages: BaseMessage[] = [];

	constructor(chatId: string) {
		const sessionsDir = path.join(getAppDir(), "sessions", chatId);
		this.filePath = path.join(sessionsDir, "checkpoint.json");
	}

	/**
	 * Loads checkpoint state from disk if it exists.
	 */
	async load(): Promise<void> {
		try {
			const content = await fs.readFile(this.filePath, "utf-8");
			const data = JSON.parse(content);
			if (data && Array.isArray(data.messages)) {
				// biome-ignore lint/suspicious/noExplicitAny: raw JSON data deserialization
				this.messages = data.messages.map((m: any) => deserializeMessage(m));
			} else {
				this.messages = [];
			}
		} catch {
			this.messages = [];
		}
	}

	/**
	 * Saves current checkpoint state to disk.
	 */
	async save(): Promise<void> {
		try {
			await fs.mkdir(path.dirname(this.filePath), { recursive: true });
			const serialized = this.messages.map((m) => serializeMessage(m));
			const data = {
				messages: serialized,
			};
			await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), "utf-8");
		} catch (err) {
			console.error("[FileCheckpointSaver] Failed to save checkpoint:", err);
		}
	}

	/**
	 * Clears the persistent checkpoint file.
	 */
	async clear(): Promise<void> {
		try {
			await fs.rm(this.filePath, { force: true });
			this.messages = [];
		} catch (err) {
			console.error("[FileCheckpointSaver] Failed to clear checkpoint:", err);
		}
	}

	/**
	 * Archives current checkpoint by renaming checkpoint.json to checkpoint_<timestamp>.json
	 */
	async archive(): Promise<void> {
		try {
			await fs.access(this.filePath);
			const sessionsDir = path.dirname(this.filePath);
			const timestamp = Math.floor(Date.now() / 1000);
			const archivePath = path.join(
				sessionsDir,
				`checkpoint_${timestamp}.json`,
			);
			await fs.rename(this.filePath, archivePath);
			this.messages = [];
		} catch {
			// file doesn't exist, nothing to archive
		}
	}
}
