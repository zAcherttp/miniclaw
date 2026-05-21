import fs from "node:fs/promises";
import path from "node:path";
import { MemorySaver } from "@langchain/langgraph";
import { getAppDir } from "@/config/paths";

/**
 * A persistent file-based checkpointer for LangGraph.
 * Inherits from MemorySaver and serializes checkpoints/writes to the session directory.
 */
export class FileCheckpointSaver extends MemorySaver {
	private filePath: string;

	constructor(chatId: string) {
		super();
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
			this.storage = data.storage || {};
			this.writes = data.writes || {};
		} catch {
			// File doesn't exist or is corrupted; keep default empty structures
			this.storage = {};
			this.writes = {};
		}
	}

	/**
	 * Saves current checkpoint state to disk.
	 */
	async save(): Promise<void> {
		try {
			await fs.mkdir(path.dirname(this.filePath), { recursive: true });
			const data = {
				storage: this.storage,
				writes: this.writes,
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
			this.storage = {};
			this.writes = {};
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
			this.storage = {};
			this.writes = {};
		} catch {
			// file doesn't exist, nothing to archive
		}
	}

	// Override put to persist on write
	override async put(
		// biome-ignore lint/suspicious/noExplicitAny: Must match MemorySaver base class signature
		config: any,
		// biome-ignore lint/suspicious/noExplicitAny: Must match MemorySaver base class signature
		checkpoint: any,
		// biome-ignore lint/suspicious/noExplicitAny: Must match MemorySaver base class signature
		metadata: any,
		// biome-ignore lint/suspicious/noExplicitAny: Must match MemorySaver base class signature
	): Promise<any> {
		const res = await super.put(config, checkpoint, metadata);
		await this.save();
		return res;
	}

	// Override putWrites to persist on write
	override async putWrites(
		// biome-ignore lint/suspicious/noExplicitAny: Must match MemorySaver base class signature
		config: any,
		// biome-ignore lint/suspicious/noExplicitAny: Must match MemorySaver base class signature
		writes: any,
		// biome-ignore lint/suspicious/noExplicitAny: Must match MemorySaver base class signature
		taskId: any,
		// biome-ignore lint/suspicious/noExplicitAny: Must match MemorySaver base class signature
	): Promise<any> {
		const res = await super.putWrites(config, writes, taskId);
		await this.save();
		return res;
	}
}
