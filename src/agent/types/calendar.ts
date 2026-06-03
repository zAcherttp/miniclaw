export interface CalendarEvent {
	id: string;
	summary: string;
	description?: string;
	location?: string;
	start: string; // ISO 8601 timestamp
	end: string; // ISO 8601 timestamp
	attendees?: string[];
	hangoutLink?: string; // Google Meet URL or other link
}
