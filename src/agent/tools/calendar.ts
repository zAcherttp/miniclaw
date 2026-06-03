import cp from "node:child_process";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { logger } from "@/utils/logger";

/**
 * Executes the 'gws' binary with specified arguments safely.
 * Since we pass arguments as an array directly to spawn, it is immune to shell injection.
 */
function runGwsCommand(args: string[], workspaceDir: string): Promise<string> {
	return new Promise((resolve) => {
		logger.info(`[CalendarTool] Running: gws ${args.join(" ")}`);

		const child = cp.spawn("gws", args, {
			cwd: workspaceDir,
			env: {
				...process.env,
				PATH: process.env.PATH,
			},
		});

		let stdout = "";
		let stderr = "";

		// 30-second timeout guard
		const timer = setTimeout(() => {
			try {
				child.kill("SIGKILL");
			} catch {}
			resolve(
				"Error: Google Workspace (gws) command timed out after 30 seconds.",
			);
		}, 30000);

		child.stdout?.on("data", (chunk) => {
			stdout += chunk.toString();
		});

		child.stderr?.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		child.on("error", (err) => {
			clearTimeout(timer);
			logger.error(err, "[CalendarTool] Failed to spawn gws process");
			resolve(`Error running gws binary: ${err.message}`);
		});

		child.on("close", (code) => {
			clearTimeout(timer);

			if (code !== 0) {
				const errorMsg = stderr.trim() || stdout.trim() || `exit code ${code}`;
				logger.warn(`[CalendarTool] gws failed: ${errorMsg}`);
				resolve(`Error: ${errorMsg}`);
			} else {
				resolve(stdout.trim() || "Success");
			}
		});
	});
}

export const createManageCalendarTool = (workspaceDir: string) => {
	return new DynamicStructuredTool({
		name: "manage_calendar",
		description: [
			"Manage Google Workspace (GWS) Calendar events and scheduling.",
			"Use this tool to read agenda, create new meetings, update existing events, or cancel calendar bookings.",
		].join(" "),
		schema: z.object({
			action: z
				.enum(["create", "update", "list", "delete"])
				.describe(
					[
						"The action to perform on the calendar:",
						"- **create**: Create a new calendar event. Requires: `summary`, `start`, `end`. Optional: `description`, `location`, `attendees`, `meet`.",
						"- **list**: List upcoming events. Optional: `timeRange` ('today', 'tomorrow', 'week'), `days` (number of days to look ahead), `calendarId`.",
						"- **update**: Modify details of an existing event. Requires: `eventId`. Optional: `summary`, `start`, `end`, `description`, `location`, `attendees`.",
						"- **delete**: Remove an event. Requires: `eventId`.",
					].join("\n"),
				),
			eventId: z
				.string()
				.optional()
				.describe(
					"The unique ID of the calendar event. Required for 'update' and 'delete'.",
				),
			calendarId: z
				.string()
				.default("primary")
				.describe("The Calendar ID to target. Defaults to 'primary'."),
			summary: z
				.string()
				.optional()
				.describe("Title of the event. Required for 'create'."),
			start: z
				.string()
				.optional()
				.describe(
					"ISO 8601 start timestamp (e.g. '2026-05-31T09:00:00-07:00'). Required for 'create'.",
				),
			end: z
				.string()
				.optional()
				.describe(
					"ISO 8601 end timestamp (e.g. '2026-05-31T10:00:00-07:00'). Required for 'create'.",
				),
			description: z
				.string()
				.optional()
				.describe("Longer description of the event or meeting agenda."),
			location: z
				.string()
				.optional()
				.describe("Physical address or virtual room name/URL."),
			attendees: z
				.array(z.email())
				.optional()
				.describe("List of attendee email addresses to invite."),
			meet: z
				.boolean()
				.optional()
				.describe(
					"Set true to automatically generate a Google Meet video conference link for the event (only for 'create').",
				),
			timeRange: z
				.enum(["today", "tomorrow", "week"])
				.optional()
				.describe("Time range filter for listing events."),
			days: z
				.number()
				.optional()
				.describe(
					"Number of days ahead to list events for. Takes precedence over timeRange if specified.",
				),
		}),
		func: async ({
			action,
			eventId,
			calendarId,
			summary,
			start,
			end,
			description,
			location,
			attendees,
			meet,
			timeRange,
			days,
		}) => {
			try {
				if (action === "list") {
					const args = ["calendar", "+agenda"];

					if (calendarId && calendarId !== "primary") {
						args.push("--calendar", calendarId);
					}

					if (days !== undefined) {
						args.push("--days", days.toString());
					} else if (timeRange === "today") {
						args.push("--today");
					} else if (timeRange === "tomorrow") {
						args.push("--tomorrow");
					} else if (timeRange === "week") {
						args.push("--week");
					}

					return await runGwsCommand(args, workspaceDir);
				}

				if (action === "create") {
					if (!summary || !start || !end) {
						return "Error: Missing required fields for 'create' action. Please provide: 'summary', 'start', and 'end'.";
					}

					const args = [
						"calendar",
						"+insert",
						"--summary",
						summary,
						"--start",
						start,
						"--end",
						end,
					];

					if (calendarId && calendarId !== "primary") {
						args.push("--calendar", calendarId);
					}
					if (description) {
						args.push("--description", description);
					}
					if (location) {
						args.push("--location", location);
					}
					if (meet) {
						args.push("--meet");
					}
					if (attendees && attendees.length > 0) {
						for (const email of attendees) {
							args.push("--attendee", email);
						}
					}

					return await runGwsCommand(args, workspaceDir);
				}

				if (action === "update") {
					if (!eventId) {
						return "Error: Missing required field 'eventId' for 'update' action.";
					}

					// Standard Google API events resource uses patch/update
					// Using 'gws calendar events patch' command structure
					const args = [
						"calendar",
						"events",
						"patch",
						"--calendar",
						calendarId,
						"--eventId",
						eventId,
					];

					const patchBody: Record<string, unknown> = {};
					if (summary !== undefined) patchBody.summary = summary;
					if (description !== undefined) patchBody.description = description;
					if (location !== undefined) patchBody.location = location;

					if (start !== undefined) {
						patchBody.start = { dateTime: start };
					}
					if (end !== undefined) {
						patchBody.end = { dateTime: end };
					}
					if (attendees !== undefined) {
						patchBody.attendees = attendees.map((email) => ({ email }));
					}

					if (Object.keys(patchBody).length === 0) {
						return "Error: No fields provided to update.";
					}

					args.push("--json", JSON.stringify(patchBody));
					return await runGwsCommand(args, workspaceDir);
				}

				if (action === "delete") {
					if (!eventId) {
						return "Error: Missing required field 'eventId' for 'delete' action.";
					}

					const args = [
						"calendar",
						"events",
						"delete",
						"--calendar",
						calendarId,
						"--eventId",
						eventId,
					];

					return await runGwsCommand(args, workspaceDir);
				}

				return "Error: Unsupported calendar action.";
			} catch (err: unknown) {
				const error = err as Error;
				logger.error(
					error,
					`[CalendarTool] Exception occurred during action=${action}`,
				);
				return `Error executing manage_calendar: ${error.message}`;
			}
		},
	});
};
