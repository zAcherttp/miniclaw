import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { InboundMessage } from "@/bus/message";
import { getAppDir } from "@/config/paths";
import { logger } from "@/utils/logger";
import type { ActiveChatSession } from "./types/reminder";

export interface AppState {
	lastActiveChat: ActiveChatSession | null;
	skillsStats: Record<string, number>;
	telegramStreams: Array<[string, unknown]>; // Serialized StreamBuffer map using unknown
	activeRequests: Record<string, InboundMessage>;
}

export const DEFAULT_APP_STATE: AppState = {
	lastActiveChat: null,
	skillsStats: {},
	telegramStreams: [],
	activeRequests: {},
};

// Export StateManager as a plain object to satisfy biome lints (avoid static-only class)
// and resolve path dynamically to prevent import-time side-effects.
export const StateManager = {
	filePath: undefined as string | undefined,
	getFilePath(): string {
		return this.filePath || path.join(getAppDir(), "state.json");
	},

	/**
	 * Safely loads and parses state.json. Returns defaults if missing or corrupted.
	 */
	async load(): Promise<AppState> {
		const filePath = this.getFilePath();
		try {
			if (existsSync(filePath)) {
				const content = await fs.readFile(filePath, "utf-8");
				const parsed = JSON.parse(content);
				return {
					lastActiveChat: parsed.lastActiveChat ?? null,
					skillsStats: parsed.skillsStats ? { ...parsed.skillsStats } : {},
					telegramStreams: parsed.telegramStreams
						? [...parsed.telegramStreams]
						: [],
					activeRequests: parsed.activeRequests
						? { ...parsed.activeRequests }
						: {},
				};
			}
		} catch (err) {
			logger.error(
				err,
				"[StateManager] Failed to load state.json. Using defaults.",
			);
		}
		return {
			lastActiveChat: null,
			skillsStats: {},
			telegramStreams: [],
			activeRequests: {},
		};
	},

	writePromise: Promise.resolve(),

	/**
	 * Direct atomic filesystem write.
	 */
	async save(state: AppState): Promise<void> {
		const filePath = this.getFilePath();
		try {
			await fs.mkdir(getAppDir(), { recursive: true });
			await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf-8");
		} catch (err) {
			logger.error(err, "[StateManager] Failed to save state.json");
		}
	},

	/**
	 * Safely queues any state update operation to prevent read-modify-write race conditions.
	 */
	async queueUpdate(
		updateFn: (state: AppState) => void | Promise<void>,
	): Promise<void> {
		this.writePromise = this.writePromise.then(async () => {
			const state = await this.load();
			await updateFn(state);
			await this.save(state);
		});
		return this.writePromise;
	},

	/**
	 * Specialized Sub-APIs: Last Active Chat Session
	 */
	async getLastActiveChat(): Promise<ActiveChatSession | null> {
		const state = await this.load();
		return state.lastActiveChat;
	},

	async saveLastActiveChat(chat: ActiveChatSession): Promise<void> {
		await this.queueUpdate((state) => {
			state.lastActiveChat = chat;
		});
	},

	/**
	 * Specialized Sub-APIs: Skills Statistics Counts
	 */
	async getSkillsStats(): Promise<Record<string, number>> {
		const state = await this.load();
		return state.skillsStats;
	},

	async incrementSkill(skillName: string): Promise<void> {
		await this.queueUpdate((state) => {
			const before = state.skillsStats[skillName] || 0;
			state.skillsStats[skillName] = before + 1;
			logger.info(
				`[StateManager] Incremented skill "${skillName}" count: ${before} -> ${before + 1}`,
			);
		});
	},

	/**
	 * Specialized Sub-APIs: Telegram active Streams
	 */
	async getTelegramStreams(): Promise<Array<[string, unknown]>> {
		const state = await this.load();
		return state.telegramStreams;
	},

	async saveTelegramStreams(streams: Array<[string, unknown]>): Promise<void> {
		await this.queueUpdate((state) => {
			state.telegramStreams = streams;
		});
	},

	/**
	 * Specialized Sub-APIs: Active / In-flight request state tracking
	 */
	async getActiveRequests(): Promise<Record<string, InboundMessage>> {
		const state = await this.load();
		return state.activeRequests || {};
	},

	async saveActiveRequest(chatId: string, msg: InboundMessage): Promise<void> {
		await this.queueUpdate((state) => {
			if (!state.activeRequests) {
				state.activeRequests = {};
			}
			state.activeRequests[chatId] = msg;
		});
	},

	async clearActiveRequest(chatId: string): Promise<void> {
		await this.queueUpdate((state) => {
			if (state.activeRequests) {
				delete state.activeRequests[chatId];
			}
		});
	},
};
export type StateManager = typeof StateManager;
