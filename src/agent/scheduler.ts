import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { SystemMessage } from "@langchain/core/messages";
import type { MessageBus } from "@/bus/queue";
import { logger } from "@/utils/logger";
import { StateManager } from "./state";
import { FileCheckpointSaver } from "./store";
import type { ActiveChatSession, Reminder } from "./types/reminder";

export class TaskScheduler {
	private static instance: TaskScheduler | null = null;
	private bus: MessageBus;
	private workspaceDir: string;
	private timers = new Map<string, NodeJS.Timeout>();
	private running = false;

	private constructor(bus: MessageBus, workspaceDir: string) {
		this.bus = bus;
		this.workspaceDir = workspaceDir;
	}

	public static getInstance(
		bus: MessageBus,
		workspaceDir: string,
	): TaskScheduler {
		if (!TaskScheduler.instance) {
			TaskScheduler.instance = new TaskScheduler(bus, workspaceDir);
		}
		return TaskScheduler.instance;
	}

	/**
	 * Reset instance (primarily for testing purposes)
	 */
	public static resetInstance(): void {
		TaskScheduler.instance = null;
	}

	/**
	 * Computes the reminder trigger offset using smarter tiered thresholds:
	 * - diff >= 30m -> remind 30m before
	 * - 10m <= diff < 30m -> remind 5m before
	 * - 5m <= diff < 10m -> remind 2m before
	 * - 1m <= diff < 5m -> remind 1m before
	 * - 10s <= diff < 1m -> remind 10s before
	 * - 1s <= diff < 10s -> remind 1s before
	 * - diff < 1s -> trigger immediately
	 */
	public static calculateTriggerOffset(diffMs: number): number {
		const mins = diffMs / (60 * 1000);
		const secs = diffMs / 1000;

		if (mins >= 30) {
			return 30 * 60 * 1000;
		}
		if (mins >= 10) {
			return 5 * 60 * 1000;
		}
		if (mins >= 5) {
			return 2 * 60 * 1000;
		}
		if (mins >= 1) {
			return 1 * 60 * 1000;
		}
		if (secs >= 10) {
			return 10 * 1000;
		}
		if (secs >= 1) {
			return 1 * 1000;
		}
		return 0; // Immediate trigger
	}

	/**
	 * Load active chat session information from disk
	 */
	public async getLastActiveChat(): Promise<ActiveChatSession | null> {
		return StateManager.getLastActiveChat();
	}

	/**
	 * Start the scheduler, loading saved reminders and restoring timers
	 */
	public async start(): Promise<void> {
		if (this.running) return;
		this.running = true;
		logger.info("[Scheduler] Starting background task scheduler...");

		await this.restoreReminders();
	}

	/**
	 * Stop the scheduler, clearing all active timeouts
	 */
	public async stop(): Promise<void> {
		this.running = false;
		for (const [id, timer] of this.timers.entries()) {
			clearTimeout(timer);
			logger.info(`[Scheduler] Cancelled active timer for reminder "${id}"`);
		}
		this.timers.clear();
		logger.info("[Scheduler] Task scheduler stopped.");
	}

	/**
	 * Retrieves the absolute path to workspace reminders file
	 */
	private getRemindersPath(): string {
		return path.join(this.workspaceDir, "reminders.json");
	}

	/**
	 * Read all reminders from reminders.json
	 */
	public async readReminders(): Promise<Reminder[]> {
		const remindersPath = this.getRemindersPath();
		try {
			if (existsSync(remindersPath)) {
				const data = await fs.readFile(remindersPath, "utf-8");
				const parsed = JSON.parse(data);
				return parsed.reminders || [];
			}
		} catch (err) {
			logger.error(err, "[Scheduler] Failed to read reminders.json");
		}
		return [];
	}

	/**
	 * Write reminders array to reminders.json
	 */
	public async writeReminders(reminders: Reminder[]): Promise<void> {
		const remindersPath = this.getRemindersPath();
		try {
			await fs.writeFile(
				remindersPath,
				JSON.stringify({ reminders }, null, 2),
				"utf-8",
			);
		} catch (err) {
			logger.error(err, "[Scheduler] Failed to write reminders.json");
		}
	}

	/**
	 * Programmatically schedule a single reminder in memory and persist it
	 */
	public async scheduleReminder(reminder: Reminder): Promise<void> {
		// Calculate the trigger offset dynamically
		const now = Date.now();
		const target = new Date(reminder.targetTime).getTime();
		const diff = target - now;

		// Calculate timing offset
		const offset = TaskScheduler.calculateTriggerOffset(diff);
		const calculatedTrigger = new Date(target - offset).toISOString();
		reminder.triggerTime = calculatedTrigger;

		const triggerTimeMs = new Date(reminder.triggerTime).getTime();
		const delay = triggerTimeMs - now;

		// Cancel any existing timer
		if (this.timers.has(reminder.id)) {
			clearTimeout(this.timers.get(reminder.id));
			this.timers.delete(reminder.id);
		}

		if (reminder.status !== "pending") {
			return;
		}

		if (delay <= 0) {
			// Trigger Time is already in the past!
			if (target > now) {
				// Event hasn't happened yet -> Trigger Immediate Late Alert!
				logger.info(
					`[Scheduler] Imminent/Late trigger detected for reminder "${reminder.id}". Dispatching immediately.`,
				);
				await this.triggerReminder(reminder, true);
			} else {
				// Target time has already passed -> Mark as Missed silently
				logger.info(
					`[Scheduler] Historical deadline passed for reminder "${reminder.id}". Marking missed.`,
				);
				reminder.status = "missed";
			}
			return;
		}

		// Schedule Node timeout handle
		const timer = setTimeout(async () => {
			this.timers.delete(reminder.id);
			try {
				await this.triggerReminder(reminder, false);
			} catch (err) {
				logger.error(
					err,
					`[Scheduler] Error triggering reminder ${reminder.id}`,
				);
			}
		}, delay);

		this.timers.set(reminder.id, timer);
		logger.info(
			`[Scheduler] Scheduled reminder "${reminder.id}" (${reminder.title}) in ${(delay / 1000).toFixed(1)}s (Trigger: ${reminder.triggerTime})`,
		);
	}

	/**
	 * Actively trigger the reminder:
	 * 1. Mark as "fired"
	 * 2. Append system message to checkpoint
	 * 3. Publish programmatic outbound message to the bus
	 */
	private async triggerReminder(
		reminder: Reminder,
		isLate = false,
	): Promise<void> {
		reminder.status = "fired";

		// Read and update the reminders database
		const reminders = await this.readReminders();
		const idx = reminders.findIndex((r) => r.id === reminder.id);
		if (idx !== -1) {
			reminders[idx].status = "fired";
			await this.writeReminders(reminders);
		}

		const activeChat = await this.getLastActiveChat();
		if (!activeChat) {
			logger.warn(
				`[Scheduler] Could not trigger reminder "${reminder.id}" outbound: No last active chat session found.`,
			);
			return;
		}

		const formattedTime = new Date(reminder.targetTime)
			.toLocaleTimeString("en-US", {
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
				hour12: true,
			})
			.toLowerCase()
			.replace(/\s+/g, "");

		const typeCapitalized =
			reminder.type.charAt(0).toUpperCase() + reminder.type.slice(1);
		const latePrefix = isLate ? "⚠️ [LATE ALERT] " : "";
		const alertContent = `${latePrefix}${typeCapitalized} Reminder: ${reminder.title} at ${formattedTime}`;

		// 1. Sync Checkpoint: Append SystemMessage directly to checkpoint.json
		try {
			const checkpointer = new FileCheckpointSaver(activeChat.chatId);
			await checkpointer.load();
			checkpointer.messages.push(
				new SystemMessage(
					`[System Reminder Alert] dispatched notification to user: "${reminder.title}" (${reminder.type}) due at ${reminder.targetTime}.`,
				),
			);
			await checkpointer.save();
			logger.info(
				`[Scheduler] Appended system message context into checkpoint history for chat "${activeChat.chatId}"`,
			);
		} catch (err) {
			logger.error(
				err,
				`[Scheduler] Failed to append SystemMessage to checkpoint for chat ${activeChat.chatId}`,
			);
		}

		// 2. Programmatic Outbound Delivery: Send directly through MessageBus outbound queue (agent bypassed)
		try {
			await this.bus.publishOutbound({
				channel: activeChat.channel,
				chat_id: activeChat.chatId,
				content: alertContent,
				metadata: { _reminder: true, reminder_id: reminder.id },
			});
			logger.info(
				`[Scheduler] Dispatched programmatic outbound reminder message to channel "${activeChat.channel}" chat "${activeChat.chatId}"`,
			);
		} catch (err) {
			logger.error(
				err,
				`[Scheduler] Failed to publish outbound reminder for ${reminder.id}`,
			);
		}
	}

	/**
	 * Scan reminders.json on startup, scheduling pending items and marking stale ones
	 */
	private async restoreReminders(): Promise<void> {
		const reminders = await this.readReminders();
		let changed = false;

		for (const reminder of reminders) {
			if (reminder.status === "pending") {
				const now = Date.now();
				const target = new Date(reminder.targetTime).getTime();
				const diff = target - now;

				// Calculate trigger offset
				const offset = TaskScheduler.calculateTriggerOffset(diff);
				const calculatedTrigger = new Date(target - offset).toISOString();
				reminder.triggerTime = calculatedTrigger;

				const triggerTimeMs = new Date(reminder.triggerTime).getTime();

				if (triggerTimeMs <= now) {
					// Missed trigger
					if (target > now) {
						// Late trigger catch-up
						logger.info(
							`[Scheduler] Catching up late startup reminder "${reminder.id}"`,
						);
						await this.triggerReminder(reminder, true);
						changed = true;
					} else {
						// Entirely missed
						logger.info(
							`[Scheduler] Marking stale reminder "${reminder.id}" as missed`,
						);
						reminder.status = "missed";
						changed = true;
					}
				} else {
					// Schedule standard timer
					await this.scheduleReminder(reminder);
				}
			}
		}

		if (changed) {
			await this.writeReminders(reminders);
		}
	}

	/**
	 * Deletes a scheduled timer handle from memory
	 */
	public cancelTimer(id: string): void {
		if (this.timers.has(id)) {
			clearTimeout(this.timers.get(id));
			this.timers.delete(id);
			logger.info(`[Scheduler] Cancelled active timer handle for "${id}"`);
		}
	}
}
