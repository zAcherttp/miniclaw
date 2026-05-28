import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SystemMessage } from "@langchain/core/messages";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskScheduler } from "@/agent/scheduler";
import { StateManager } from "@/agent/state";
import { FileCheckpointSaver } from "@/agent/store";
import { getSystemInfoBlock } from "@/agent/systemInfo";
import type { Reminder } from "@/agent/types/reminder";
import { MessageBus } from "@/bus/queue";

describe("Smart Timing Trigger Offset Logic", () => {
	it("should return correct timing offsets for all tiered thresholds", () => {
		const minMs = 60 * 1000;
		const secMs = 1000;

		// 1. Well above 30 mins (e.g. 45 mins) -> remind 30 mins before
		expect(TaskScheduler.calculateTriggerOffset(45 * minMs)).toBe(30 * minMs);

		// 2. Under 30 to 10 mins (e.g. 20 mins) -> remind 5 mins before
		expect(TaskScheduler.calculateTriggerOffset(20 * minMs)).toBe(5 * minMs);

		// 3. Under 10 to 5 mins (e.g. 7 mins) -> remind 2 mins before
		expect(TaskScheduler.calculateTriggerOffset(7 * minMs)).toBe(2 * minMs);

		// 4. Under 5 mins to 1 min (e.g. 3 mins) -> remind 1 min before
		expect(TaskScheduler.calculateTriggerOffset(3 * minMs)).toBe(1 * minMs);

		// 5. Under 1 min to 10 sec (e.g. 40 sec) -> remind 10 sec before
		expect(TaskScheduler.calculateTriggerOffset(40 * secMs)).toBe(10 * secMs);

		// 6. Under 10 sec to 1 sec (e.g. 5 sec) -> remind 1 sec before
		expect(TaskScheduler.calculateTriggerOffset(5 * secMs)).toBe(1 * secMs);

		// 7. Under 1 sec (e.g. 500 ms) -> trigger immediately (0 offset)
		expect(TaskScheduler.calculateTriggerOffset(500)).toBe(0);
	});
});

describe("System Prompt Info Injection Context", () => {
	it("should format host context block correctly without memory or arch", () => {
		const block = getSystemInfoBlock("/test/workspace");
		expect(block).toContain("## HOST ENVIRONMENT & SYSTEM CONTEXT");
		expect(block).toContain("Active Workspace Directory");
		expect(block).toContain("/test/workspace");
		expect(block).toContain("Operating System");
		expect(block).toContain("Default Shell");
		expect(block).not.toContain("System Memory");
		expect(block).not.toContain("Platform Architecture");
	});
});

describe("TaskScheduler Daemon & Outbound programmatic dispatch", () => {
	let tempSandbox: string;
	let bus: MessageBus;

	beforeEach(async () => {
		tempSandbox = await fs.mkdtemp(
			path.join(os.tmpdir(), "miniclaw-scheduler-"),
		);
		bus = new MessageBus();
		TaskScheduler.resetInstance();

		// Mock active chat session using StateManager
		StateManager.filePath = path.join(tempSandbox, "state.json");
		const activeSession = {
			channel: "telegram",
			chatId: "12345",
			timestamp: new Date().toISOString(),
		};
		await StateManager.saveLastActiveChat(activeSession);

		// biome-ignore lint/suspicious/noExplicitAny: globally expose bus for reminders tool testing
		(global as any).messageBus = bus;
	});

	afterEach(async () => {
		await fs.rm(tempSandbox, { recursive: true, force: true });
		StateManager.filePath = undefined;
		vi.restoreAllMocks();
		TaskScheduler.resetInstance();
	});

	it("should schedule, trigger, and programmatically publish outbound reminder without LLM/agent Graph run", async () => {
		const scheduler = TaskScheduler.getInstance(bus, tempSandbox);
		await scheduler.start();

		// Spy on consumeInbound or similar to assert no agent node is ran
		const publishInboundSpy = vi.spyOn(bus, "publishInbound");
		const publishOutboundSpy = vi.spyOn(bus, "publishOutbound");

		// Create a reminder that triggers in 20ms
		const targetTime = new Date(Date.now() + 20).toISOString();
		const reminder: Reminder = {
			id: "rem-test-1",
			title: "Critical meeting",
			type: "calendar",
			targetTime,
			triggerTime: "",
			status: "pending",
		};

		const checkpointer = new FileCheckpointSaver("12345");
		await checkpointer.clear();

		await scheduler.scheduleReminder(reminder);

		// Assert that it is initially pending
		expect(reminder.status).toBe("pending");

		// Wait 100ms for the timer to fire in the background
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Verify trigger results:
		// 1. Status set to fired
		expect(reminder.status).toBe("fired");

		// 2. Outbound message published
		expect(publishOutboundSpy).toHaveBeenCalled();
		expect(publishInboundSpy).not.toHaveBeenCalled(); // Agent completely bypassed!

		// 3. System message appended to checkpoint
		await checkpointer.load();
		const systemMsgs = checkpointer.messages.filter(
			(m) => m instanceof SystemMessage,
		);
		expect(systemMsgs.length).toBe(1);
		expect(systemMsgs[0].content).toContain(
			'dispatched notification to user: "Critical meeting"',
		);

		await scheduler.stop();
	});
});
