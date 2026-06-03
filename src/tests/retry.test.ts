import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks for ES Modules static binding safety
const mockGraphInvoke = vi.fn();
vi.mock("@/agent/graph", () => ({
	compiledGraph: {
		invoke: (...args: unknown[]) => mockGraphInvoke(...args),
	},
}));

vi.mock("@/agent/agents", () => ({
	createMainAgent: vi.fn().mockResolvedValue({
		options: { model: "ollama:gemma2", tools: [] },
	}),
}));

vi.mock("@/agent/models", () => ({
	createChatModel: vi.fn().mockResolvedValue({
		invoke: vi.fn().mockResolvedValue({ content: "{}" }),
	}),
}));

// Sandbox homedir to isolate checkpoints
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-retry-"));
vi.mock("node:os", async (importOriginal) => {
	const original = await importOriginal<typeof import("node:os")>();
	return {
		...original,
		default: {
			...original,
			homedir: () => tempHome,
		},
		homedir: () => tempHome,
	};
});

import { AgentLoop } from "@/agent/loop";
import { StateManager } from "@/agent/state";
import { MessageBus } from "@/bus/queue";
import type { AppConfig } from "@/config/schema";

describe("Queue-based Inbound Retry & Recovery", () => {
	let bus: MessageBus;
	let config: AppConfig;

	beforeEach(() => {
		bus = new MessageBus();
		if (fs.existsSync(tempHome)) {
			fs.rmSync(tempHome, { recursive: true, force: true });
		}
		fs.mkdirSync(tempHome, { recursive: true });
		StateManager.filePath = path.join(tempHome, "state.json");

		config = {
			agent: {
				model: "ollama:gemma2",
				temperature: 0,
			},
			workspace_dir: path.join(tempHome, "workspace"),
			channels: {
				telegram: {
					enabled: false,
				},
			},
		} as unknown as AppConfig;

		mockGraphInvoke.mockReset();
	});

	afterEach(() => {
		if (fs.existsSync(tempHome)) {
			fs.rmSync(tempHome, { recursive: true, force: true });
		}
		StateManager.filePath = undefined;
		vi.restoreAllMocks();
	});

	it("should retry a failed request with exponential backoff on the queue", async () => {
		let callCount = 0;
		mockGraphInvoke.mockImplementation(async () => {
			callCount++;
			if (callCount === 1) {
				throw new Error("Ollama connection refused (simulated)");
			}
			return { messages: [] };
		});

		const agentLoop = new AgentLoop(config, bus);
		await agentLoop.start();

		// Publish inbound request
		await bus.publishInbound({
			channel: "telegram",
			sender_id: "user1",
			chat_id: "chat123",
			content: "test message",
			metadata: { message_id: "100" },
		});

		// Wait for the first attempt to process and fail (debounce = 250ms)
		await new Promise((resolve) => setTimeout(resolve, 300));

		// Verify first attempt ran and failed, and active request is saved
		expect(mockGraphInvoke).toHaveBeenCalledTimes(1);
		let active = await StateManager.getActiveRequests();
		expect(active.chat123).toBeDefined();
		expect(active.chat123.metadata?._retryCount).toBe(1);

		// Wait for retry (delay is 1000ms for attempt 1 + 250ms debounce)
		await new Promise((resolve) => setTimeout(resolve, 1300));

		// Verify second attempt was processed and succeeded
		expect(mockGraphInvoke).toHaveBeenCalledTimes(2);
		active = await StateManager.getActiveRequests();
		expect(active.chat123).toBeUndefined(); // Cleared upon success

		await agentLoop.stop();
	});

	it("should recover and retry pending active requests on startup", async () => {
		// Pre-populate StateManager with an active request representing an interrupted session
		const pendingMsg = {
			channel: "telegram",
			sender_id: "user1",
			chat_id: "chat999",
			content: "recover me please",
			metadata: { message_id: "200", _retryCount: 1 },
		};
		await StateManager.saveActiveRequest("chat999", pendingMsg);

		mockGraphInvoke.mockResolvedValue({ messages: [] });

		const agentLoop = new AgentLoop(config, bus);

		// Startup the loop -> should trigger recoverPendingMessages
		await agentLoop.start();

		// Wait for the recovered message to process (debounce = 250ms)
		await new Promise((resolve) => setTimeout(resolve, 350));

		// Verify the request was recovered, processed, and cleared from active requests
		expect(mockGraphInvoke).toHaveBeenCalledTimes(1);
		const active = await StateManager.getActiveRequests();
		expect(active.chat999).toBeUndefined();

		await agentLoop.stop();
	});

	it("should fall back to plain text when Telegram rejects MarkdownV2 entities", async () => {
		const { TelegramChannel } = await import("@/channels/telegram");
		const channel = new TelegramChannel(bus, "12345:dummy", {
			allowFrom: ["*"],
		});
		const bot = (channel as unknown as { bot: import("grammy").Bot }).bot;
		bot.botInfo = {
			id: 1234567,
			is_bot: true,
			first_name: "MyBot",
			username: "my_bot",
			can_join_groups: true,
			can_read_all_group_messages: false,
			supports_inline_queries: false,
		};

		let attempt = 0;
		const apiCalls: { method: string; payload: Record<string, unknown> }[] = [];
		bot.api.config.use((async (
			_prev: unknown,
			method: string,
			payload: Record<string, unknown>,
		) => {
			apiCalls.push({ method, payload });
			if (method === "sendMessage") {
				attempt++;
				if (attempt === 1) {
					// Simulate MarkdownV2 parse error
					throw {
						message:
							"Call to 'sendMessage' failed! (400: Bad Request: can't parse entities)",
						description: "Bad Request: can't parse entities",
					};
				}
			}
			return { ok: true, result: {} };
		}) as unknown as Parameters<
			import("grammy").Bot["api"]["config"]["use"]
		>[0]);

		await channel.send({
			channel: "telegram",
			chat_id: "12345",
			content: "unclosed { raw bracket",
		});

		// Verify it was called twice: first with MarkdownV2, second as plain text fallback
		expect(apiCalls).toHaveLength(2);
		expect(apiCalls[0].method).toBe("sendMessage");
		expect(apiCalls[0].payload.parse_mode).toBe("MarkdownV2");
		expect(apiCalls[1].method).toBe("sendMessage");
		expect(apiCalls[1].payload.parse_mode).toBeUndefined(); // no parse mode on fallback
	});

	it("should retry stream conclusion under transient failures", async () => {
		const { TelegramChannel } = await import("@/channels/telegram");
		const channel = new TelegramChannel(bus, "12345:dummy", {
			allowFrom: ["*"],
		});
		const bot = (channel as unknown as { bot: import("grammy").Bot }).bot;
		bot.botInfo = {
			id: 1234567,
			is_bot: true,
			first_name: "MyBot",
			username: "my_bot",
			can_join_groups: true,
			can_read_all_group_messages: false,
			supports_inline_queries: false,
		};

		let attempt = 0;
		const apiCalls: { method: string; payload: Record<string, unknown> }[] = [];
		bot.api.config.use((async (
			_prev: unknown,
			method: string,
			payload: Record<string, unknown>,
		) => {
			apiCalls.push({ method, payload });
			if (method === "sendMessage") {
				attempt++;
				if (attempt < 3) {
					// Simulate transient network or server error
					throw new Error("Temporary network error (simulated)");
				}
			}
			return { ok: true, result: {} };
		}) as unknown as Parameters<
			import("grammy").Bot["api"]["config"]["use"]
		>[0]);

		// Conclude stream with a buffer
		const buf = {
			text: "streamed message",
			draft_id: 1,
			last_edit: Date.now(),
			chat_id: "12345",
		};

		await channel.concludeStream("chat-12345", buf);

		// Verify it called sendMessage 3 times (2 failures + 1 success)
		expect(attempt).toBe(3);
		expect(apiCalls).toHaveLength(3);
		expect(channel.streamBufs.has("chat-12345")).toBe(false); // Cleared upon success
	});
});
