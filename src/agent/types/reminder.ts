export type ReminderType = "task" | "calendar" | "general" | "custom";

export interface Reminder {
	id: string;
	title: string;
	type: ReminderType;
	targetTime: string; // ISO timestamp
	triggerTime: string; // Calculated trigger ISO timestamp
	status: "pending" | "fired" | "completed" | "cancelled" | "missed";
	payload?: {
		taskStatus?: "pending" | "done" | "blocked";
		meetingUrl?: string;
		notes?: string;
	};
}

export interface ActiveChatSession {
	channel: string;
	chatId: string;
	timestamp: string;
}
