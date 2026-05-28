import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { MessageBus } from "@/bus/queue";
import { logger } from "@/utils/logger";
import { TaskScheduler } from "../scheduler";
import type { Reminder, ReminderType } from "../types/reminder";

const ReminderTypeSchema = z.enum(["task", "calendar", "general", "custom"]);

const ReminderPayloadSchema = z.object({
	taskStatus: z.enum(["pending", "done", "blocked"]).optional(),
	meetingUrl: z.string().optional(),
	notes: z.string().optional(),
});

export const createManageRemindersTool = (
	workspaceDir: string,
	bus: MessageBus,
) => {
	return new DynamicStructuredTool({
		name: "manage_reminders",
		description:
			"Creates, updates, lists, or deletes stateful user reminders/tasks in reminders.json. This handles all user-facing calendar alerts, deadlined tasks, and alerts. Each reminder features a targetTime and triggerTime.",
		schema: z.object({
			action: z
				.enum(["create", "update", "list", "delete"])
				.describe("The action to perform on the reminders database"),
			id: z
				.string()
				.optional()
				.describe("The unique ID of the reminder (required for update/delete)"),
			title: z
				.string()
				.optional()
				.describe(
					"Title or details of the task/reminder (required for create)",
				),
			type: ReminderTypeSchema.optional().describe(
				"The type of reminder (required for create)",
			),
			targetTime: z
				.string()
				.optional()
				.describe(
					"The ISO timestamp when the event/deadline occurs, e.g. '2026-05-28T18:00:00.000Z' (required for create)",
				),
			status: z
				.enum(["pending", "fired", "completed", "cancelled", "missed"])
				.optional()
				.describe("The new status of the reminder (optional for update)"),
			payload: ReminderPayloadSchema.optional().describe(
				"Optional metadata state payload for sub-tasks or meetings (optional)",
			),
		}),
		func: async ({ action, id, title, type, targetTime, status, payload }) => {
			const scheduler = TaskScheduler.getInstance(bus, workspaceDir);

			try {
				const reminders = await scheduler.readReminders();

				if (action === "list") {
					logger.info(
						`[RemindersTool] Listing reminders (count=${reminders.length})`,
					);
					return JSON.stringify(reminders, null, 2);
				}

				if (action === "create") {
					if (!title || !type || !targetTime) {
						return "Error: Missing required fields ('title', 'type', 'targetTime') for creating a reminder.";
					}

					// Validate date format
					const targetDate = new Date(targetTime);
					if (Number.isNaN(targetDate.getTime())) {
						return `Error: Invalid targetTime ISO format '${targetTime}'.`;
					}

					const newId = `rem-${Date.now()}`;
					const newReminder: Reminder = {
						id: newId,
						title,
						type: type as ReminderType,
						targetTime,
						triggerTime: "", // Calculated dynamically by scheduleReminder
						status: "pending",
						payload: payload || {},
					};

					reminders.push(newReminder);
					await scheduler.writeReminders(reminders);
					await scheduler.scheduleReminder(newReminder);

					logger.info(
						`[RemindersTool] Created unified reminder "${newId}" (${title})`,
					);
					return `Successfully created reminder. ID: ${newId}. Scheduled trigger at ${newReminder.triggerTime}`;
				}

				if (action === "update") {
					if (!id) {
						return "Error: Missing required field 'id' for updating a reminder.";
					}

					const idx = reminders.findIndex((r) => r.id === id);
					if (idx === -1) {
						return `Error: Reminder with ID '${id}' not found.`;
					}

					const reminder = reminders[idx];

					if (title !== undefined) reminder.title = title;
					if (type !== undefined) reminder.type = type as ReminderType;
					if (status !== undefined) reminder.status = status;
					if (payload !== undefined) {
						reminder.payload = {
							...(reminder.payload || {}),
							...payload,
						};
					}

					let timeChanged = false;
					if (targetTime !== undefined) {
						const newTargetDate = new Date(targetTime);
						if (Number.isNaN(newTargetDate.getTime())) {
							return `Error: Invalid targetTime ISO format '${targetTime}'.`;
						}
						reminder.targetTime = targetTime;
						timeChanged = true;
					}

					// If task was marked done/cancelled, clear any scheduled timers
					if (
						reminder.status === "completed" ||
						reminder.status === "cancelled"
					) {
						scheduler.cancelTimer(reminder.id);
					} else if (timeChanged || reminder.status === "pending") {
						// Reschedule if target time changed or reset back to pending
						reminder.status = "pending";
						await scheduler.scheduleReminder(reminder);
					}

					await scheduler.writeReminders(reminders);
					logger.info(`[RemindersTool] Updated reminder "${id}"`);
					return `Successfully updated reminder '${id}'.`;
				}

				if (action === "delete") {
					if (!id) {
						return "Error: Missing required field 'id' for deleting a reminder.";
					}

					const idx = reminders.findIndex((r) => r.id === id);
					if (idx === -1) {
						return `Error: Reminder with ID '${id}' not found.`;
					}

					// Clear timer handle
					scheduler.cancelTimer(id);

					reminders.splice(idx, 1);
					await scheduler.writeReminders(reminders);

					logger.info(`[RemindersTool] Deleted reminder "${id}"`);
					return `Successfully deleted reminder '${id}'.`;
				}

				return "Error: Unsupported action.";
			} catch (err: unknown) {
				const error = err as Error;
				logger.error(
					error,
					`[RemindersTool] Error managing reminders action=${action}`,
				);
				return `Error executing manage_reminders: ${error.message}`;
			}
		},
	});
};
