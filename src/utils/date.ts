/**
 * Returns today's date as an ISO 8601 date string (YYYY-MM-DD).
 * Single source of truth for daily cron date comparisons.
 */
export function todayISODate(): string {
	return new Date().toISOString().split("T")[0];
}
