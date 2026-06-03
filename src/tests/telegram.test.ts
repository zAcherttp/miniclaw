import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Redirect homedir to a sandbox temp folder for this test
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-telegram-"));

import type { Bot } from "grammy";
import type { AgentLoop } from "@/agent/loop";
import { type SerializedStreamEntry, StateManager } from "@/agent/state";
import { MessageBus } from "@/bus/queue";
import type {
	ChannelBlockedAttemptEvent,
	ChannelInboundEvent,
} from "@/channels/base";
import { TelegramChannel, toMarkdownV2 } from "@/channels/telegram";
import { getAppDir, getMediaDir } from "@/config/paths";

describe("Telegram Channel Integration & Recovery", () => {
	let bus: MessageBus;

	beforeEach(() => {
		vi.spyOn(os, "homedir").mockReturnValue(tempHome);
		bus = new MessageBus();
		if (fs.existsSync(tempHome)) {
			fs.rmSync(tempHome, { recursive: true, force: true });
		}
		fs.mkdirSync(tempHome, { recursive: true });
		StateManager.filePath = path.join(tempHome, ".miniclaw", "state.json");
	});

	afterEach(() => {
		if (fs.existsSync(tempHome)) {
			fs.rmSync(tempHome, { recursive: true, force: true });
		}
		StateManager.filePath = undefined;
		vi.restoreAllMocks();
	});

	type Config = Bot["botInfo"];

	function makeBotConfig(overrides?: Partial<Config>): Config {
		return {
			id: 1234567,
			is_bot: true,
			first_name: "MyBot",
			username: "my_bot",
			can_join_groups: true,
			can_read_all_group_messages: false,
			supports_inline_queries: false,
			...overrides,
		} as unknown as Config;
	}

	type TelegramUpdate = Parameters<Bot["handleUpdate"]>[0];

	function makeMessageUpdate(
		messageOverrides: Partial<NonNullable<TelegramUpdate["message"]>>,
		updateOverrides?: Partial<Omit<TelegramUpdate, "message">>,
	): TelegramUpdate {
		const message = {
			message_id: 1,
			date: Math.floor(Date.now() / 1000),
			chat: {
				id: 12345,
				type: "private" as const,
				first_name: "User",
			},
			from: {
				id: 12345,
				is_bot: false,
				first_name: "User",
				username: "user",
			},
			text: "test",
			...messageOverrides,
		} satisfies NonNullable<TelegramUpdate["message"]>;

		return {
			update_id: 10001,
			message,
			...updateOverrides,
		} as TelegramUpdate;
	}

	function setupChannel(allowFrom: string[] = ["*"], agentLoop?: AgentLoop) {
		const channel = new TelegramChannel(
			bus,
			"12345:dummy",
			{
				allowFrom,
				streaming: true,
			},
			agentLoop,
		);
		const bot = (channel as unknown as { bot: Bot }).bot;
		bot.botInfo = makeBotConfig();
		vi.spyOn(bot, "start").mockImplementation(async () => {});
		vi.spyOn(bot, "stop").mockImplementation(async () => {});
		return { channel, bot };
	}

	it("should enforce allowed list policies (block unlisted, allow listed)", async () => {
		const { channel, bot } = setupChannel(["allowed_user", "99999"]);
		await channel.start();

		let blockedEvent: ChannelBlockedAttemptEvent | null = null;
		channel.onBlockedAttempt = (event) => {
			blockedEvent = event;
		};

		let inboundEvent: ChannelInboundEvent | null = null;
		channel.onInboundMessage = (event) => {
			inboundEvent = event;
		};

		// 1. Test Blocked User
		const blockedUpdate = makeMessageUpdate(
			{
				message_id: 1,
				chat: { id: 11111, type: "private" as const, first_name: "Blocked" },
				from: {
					id: 11111,
					is_bot: false,
					first_name: "Blocked",
					username: "blocked_user",
				},
				text: "hey there",
			},
			{
				update_id: 10001,
			},
		);

		await bot.handleUpdate(blockedUpdate);

		expect(blockedEvent).not.toBeNull();
		// biome-ignore lint/style/noNonNullAssertion: verified not null in line above
		const eventObj = blockedEvent!;
		expect(eventObj.sender_id).toBe("11111");
		expect(eventObj.content).toBe("hey there");
		expect(inboundEvent).toBeNull();

		// 2. Test Allowed User
		const allowedUpdate = makeMessageUpdate(
			{
				message_id: 2,
				chat: { id: 99999, type: "private" as const, first_name: "Allowed" },
				from: {
					id: 99999,
					is_bot: false,
					first_name: "Allowed",
					username: "allowed_user",
				},
				text: "hello miniclaw",
			},
			{
				update_id: 10002,
			},
		);

		blockedEvent = null;
		await bot.handleUpdate(allowedUpdate);

		expect(blockedEvent).toBeNull();
		expect(inboundEvent).not.toBeNull();
		// biome-ignore lint/style/noNonNullAssertion: verified not null in line above
		const inboundObj = inboundEvent!;
		expect(inboundObj.sender_id).toBe("99999");
		expect(inboundObj.content).toBe("hello miniclaw");

		// Verify published message in queue
		const msg = await bus.consumeInbound();
		expect(msg.content).toBe("hello miniclaw");

		await channel.stop();
	});

	it("should parse text document attachments, write them to media dir and include an attachment notice", async () => {
		const { channel, bot } = setupChannel(["*"]);
		await channel.start();

		// Mock outgoing getFile request
		bot.api.config.use((async (
			_prev: unknown,
			method: string,
			_payload: unknown,
		) => {
			if (method === "getFile") {
				return {
					ok: true,
					result: {
						file_id: "doc123",
						file_path: "documents/test.txt",
					},
				};
			}
			return { ok: true, result: {} };
		}) as unknown as Parameters<Bot["api"]["config"]["use"]>[0]);

		// Mock global fetch for downloading the file
		const mockText = "Important meeting notes.";
		const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue({
			ok: true,
			arrayBuffer: async () => new TextEncoder().encode(mockText).buffer,
		} as Response);

		const documentUpdate = makeMessageUpdate(
			{
				message_id: 3,
				text: undefined,
				caption: "Here is the plan",
				document: {
					file_id: "doc123",
					file_unique_id: "doc123unique",
					file_name: "notes.txt",
					mime_type: "text/plain",
					file_size: mockText.length,
				},
			},
			{
				update_id: 10003,
			},
		);

		let inboundContent = "";
		channel.onInboundMessage = (event) => {
			inboundContent = event.content;
		};

		await bot.handleUpdate(documentUpdate);

		// Verify fetch was called
		expect(mockFetch).toHaveBeenCalled();

		// Verify media file was written to disk
		const mediaFile = path.join(getMediaDir(), "notes.txt");
		expect(fs.existsSync(mediaFile)).toBe(true);
		expect(fs.readFileSync(mediaFile, "utf-8")).toBe(mockText);

		// Verify attachment notice was prepended to message content
		expect(inboundContent).toContain("user attached notes.txt");
		expect(inboundContent).toContain("Here is the plan");

		await channel.stop();
	});

	it("should stream message deltas with drafts and persist/clear streams in telegram_streams.json", async () => {
		const { channel, bot } = setupChannel(["*"]);
		const apiCalls: { method: string; payload: Record<string, unknown> }[] = [];

		bot.api.config.use((async (
			_prev: unknown,
			method: string,
			payload: unknown,
		) => {
			const payloadRecord = payload as Record<string, unknown>;
			apiCalls.push({ method, payload: payloadRecord });
			if (method === "sendMessage") {
				return {
					ok: true,
					result: {
						message_id: 1001,
						chat: {
							id: payloadRecord.chat_id,
							type: "private",
						},
						date: Math.floor(Date.now() / 1000),
						text: payloadRecord.text,
					},
				};
			}
			return { ok: true, result: {} };
		}) as unknown as Parameters<Bot["api"]["config"]["use"]>[0]);

		// Start the channel to initialize
		await channel.start();

		// Send initial delta
		await channel.sendDelta("12345", "My first delta");

		// Verify sendMessageDraft API call
		expect(apiCalls.some((c) => c.method === "sendMessageDraft")).toBe(true);
		const draftCall = apiCalls.find((c) => c.method === "sendMessageDraft");
		expect(draftCall?.payload.text).toBe("My first delta");
		expect(draftCall?.payload.chat_id).toBe(12345);

		// Verify streams exist in StateManager and contain the stream buffer (with empty text for performance)
		const streams = await StateManager.getTelegramStreams();
		expect(streams).toHaveLength(1);
		expect(streams[0][0]).toBe("12345");
		expect((streams[0][1] as { text: string }).text).toBe("");

		// Send second delta concluding the stream
		apiCalls.length = 0;
		await channel.sendDelta("12345", " with an ending.", {
			_stream_end: true,
		});

		// Verify final sendMessage call
		expect(apiCalls.some((c) => c.method === "sendMessage")).toBe(true);
		const sendCall = apiCalls.find((c) => c.method === "sendMessage");
		expect(sendCall?.payload.text).toBe(
			toMarkdownV2("My first delta with an ending."),
		);

		// Verify stream buffer is cleared from StateManager
		const streamsAfter = await StateManager.getTelegramStreams();
		expect(streamsAfter).toHaveLength(0);

		await channel.stop();
	});

	it("should edit a single tool hint message and conclude it with time/collapsed summary when the main stream ends", async () => {
		const { channel, bot } = setupChannel(["*"]);
		const apiCalls: { method: string; payload: Record<string, unknown> }[] = [];

		bot.api.config.use((async (
			_prev: unknown,
			method: string,
			payload: unknown,
		) => {
			const payloadRecord = payload as Record<string, unknown>;
			apiCalls.push({ method, payload: payloadRecord });
			if (method === "sendMessage") {
				return {
					ok: true,
					result: {
						message_id: 2001,
						chat: {
							id: payloadRecord.chat_id,
							type: "private",
						},
						date: Math.floor(Date.now() / 1000),
						text: payloadRecord.text,
					},
				};
			}
			return { ok: true, result: {} };
		}) as unknown as Parameters<Bot["api"]["config"]["use"]>[0]);

		await channel.start();

		// Simulate inbound message to start turn timing
		const mockUpdate = makeMessageUpdate(
			{
				message_id: 501,
				text: "Run some tools please",
			},
			{
				update_id: 30001,
			},
		);
		await bot.handleUpdate(mockUpdate);

		// Now send delta for first tool start
		const t0 = Date.now();
		const dateSpy = vi.spyOn(Date, "now").mockReturnValue(t0);

		apiCalls.length = 0;
		await channel.sendDelta("12345", '⚙️ Searching skills for "calendar"...\n', {
			_stream_id: "tools-123",
			_stream_delta: true,
			_tool_names: ["search_skills"],
		});

		// Verify draft is created
		expect(apiCalls.some((c) => c.method === "sendMessageDraft")).toBe(true);
		let draftCall = apiCalls.find((c) => c.method === "sendMessageDraft");
		expect(draftCall?.payload.text).toBe(
			'⚙️ Searching skills for "calendar"...\n',
		);
		// Conclude the first tool block (stream_end for tools)
		apiCalls.length = 0;
		await channel.sendDelta("12345", "", {
			_stream_id: "tools-123",
			_stream_end: true,
		});

		// Verify it did NOT send a final message yet (stays open)
		expect(apiCalls.some((c) => c.method === "sendMessage")).toBe(false);

		// Advance time to bypass editIntervalMs (600ms) throttling
		dateSpy.mockReturnValue(t0 + 1000);

		// Send delta for second tool start
		apiCalls.length = 0;
		await channel.sendDelta("12345", "⚙️ Reading file: SKILL.md...\n", {
			_stream_id: "tools-123",
			_stream_delta: true,
			_tool_names: ["read_file"],
		});

		// Verify it appended to the draft text and edited the draft
		expect(apiCalls.some((c) => c.method === "sendMessageDraft")).toBe(true);
		draftCall = apiCalls.find((c) => c.method === "sendMessageDraft");
		expect(draftCall?.payload.text).toBe(
			'⚙️ Searching skills for "calendar"...\n⚙️ Reading file: SKILL.md...\n',
		);

		// Advance time and send third tool start (making it total of 3 tools > 2)
		dateSpy.mockReturnValue(t0 + 2000);
		apiCalls.length = 0;
		await channel.sendDelta(
			"12345",
			"⚙️ Running command: lark-cli calendar...\n",
			{
				_stream_id: "tools-123",
				_stream_delta: true,
				_tool_names: ["execute"],
			},
		);

		// Verify it appended to the draft text and edited the draft
		expect(apiCalls.some((c) => c.method === "sendMessageDraft")).toBe(true);
		draftCall = apiCalls.find((c) => c.method === "sendMessageDraft");
		expect(draftCall?.payload.text).toBe(
			'⚙️ Searching skills for "calendar"...\n⚙️ Reading file: SKILL.md...\n⚙️ Running command: lark-cli calendar...\n',
		);

		// Now start and stream the main response text
		apiCalls.length = 0;
		await channel.sendDelta("12345", "Here is the final response.");

		// Conclude the main stream
		apiCalls.length = 0;
		await channel.sendDelta("12345", "", {
			_stream_end: true,
		});

		// Verify that both final messages are sent
		// 1. The main response message
		// 2. The concluded tool hint message containing "Worked for" and the collapsed tool count
		const sendCalls = apiCalls.filter((c) => c.method === "sendMessage");
		expect(sendCalls).toHaveLength(2);

		// The main response
		expect(sendCalls[0].payload.text).toBe(
			toMarkdownV2("Here is the final response."),
		);

		// The concluded tool hint (should be wrapped in blockquote since totalCalls = 3 > 2)
		const toolHintText = sendCalls[1].payload.text as string;
		expect(toolHintText).toContain("Worked for 2s");
		expect(toolHintText).toContain("<blockquote expandable>");
		expect(toolHintText).toContain('⚙️ Searching skills for "calendar"...');
		expect(toolHintText).toContain("⚙️ Reading file: SKILL.md...");
		expect(toolHintText).toContain("⚙️ Running command: lark-cli calendar...");
		expect(toolHintText).toContain("</blockquote>");

		dateSpy.mockRestore();
		await channel.stop();
	});

	it("should not wrap tool hints in expandable blockquote if there are 2 or fewer tool calls", async () => {
		const { channel, bot } = setupChannel(["*"]);
		const apiCalls: { method: string; payload: Record<string, unknown> }[] = [];

		bot.api.config.use((async (
			_prev: unknown,
			method: string,
			payload: unknown,
		) => {
			apiCalls.push({ method, payload: payload as Record<string, unknown> });
			return { ok: true, result: {} };
		}) as unknown as Parameters<Bot["api"]["config"]["use"]>[0]);

		await channel.start();

		// Simulate inbound message to start turn timing
		const mockUpdate = makeMessageUpdate(
			{
				message_id: 502,
				text: "Run some tools please",
			},
			{
				update_id: 30002,
			},
		);
		await bot.handleUpdate(mockUpdate);

		const t0 = Date.now();
		const dateSpy = vi.spyOn(Date, "now").mockReturnValue(t0);

		// Send delta for first tool start
		await channel.sendDelta("12345", '⚙️ Searching skills for "calendar"...\n', {
			_stream_id: "tools-123",
			_stream_delta: true,
			_tool_names: ["search_skills"],
		});

		// Conclude the first tool block
		await channel.sendDelta("12345", "", {
			_stream_id: "tools-123",
			_stream_end: true,
		});

		// Advance time
		dateSpy.mockReturnValue(t0 + 1000);

		// Send delta for second tool start (total = 2)
		await channel.sendDelta("12345", "⚙️ Reading file: SKILL.md...\n", {
			_stream_id: "tools-123",
			_stream_delta: true,
			_tool_names: ["read_file"],
		});

		// Stream main response and conclude turn
		await channel.sendDelta("12345", "Here is the response.");
		apiCalls.length = 0;
		await channel.sendDelta("12345", "", {
			_stream_end: true,
		});

		const sendCalls = apiCalls.filter((c) => c.method === "sendMessage");
		expect(sendCalls).toHaveLength(2);

		const toolHintText = sendCalls[1].payload.text as string;
		expect(toolHintText).toContain("Worked for 1s");
		// Should NOT contain the collapsible blockquote tags
		expect(toolHintText).not.toContain("<blockquote expandable>");
		expect(toolHintText).not.toContain("</blockquote>");
		expect(toolHintText).toContain('⚙️ Searching skills for "calendar"...');
		expect(toolHintText).toContain("⚙️ Reading file: SKILL.md...");

		dateSpy.mockRestore();
		await channel.stop();
	});

	it("should recover and discard in-progress streams during the boot/start recovery phase to avoid double messaging", async () => {
		// 1. Manually write a persisted stream buffer representing an interrupted run using StateManager
		const mockStreams: SerializedStreamEntry[] = [
			[
				"98765",
				{
					text: "This stream was in progress when the app crashed.",
					draft_id: 1,
					last_edit: Date.now() - 10000,
					chat_id: "98765",
					metadata: { reply_to: "42" },
				},
			],
		];
		await StateManager.saveTelegramStreams(mockStreams);

		// 2. Instantiate and start a new TelegramChannel instance
		const { channel, bot } = setupChannel(["*"]);
		const apiCalls: { method: string; payload: Record<string, unknown> }[] = [];

		bot.api.config.use((async (
			_prev: unknown,
			method: string,
			payload: unknown,
		) => {
			const payloadRecord = payload as Record<string, unknown>;
			apiCalls.push({ method, payload: payloadRecord });
			return { ok: true, result: {} };
		}) as unknown as Parameters<Bot["api"]["config"]["use"]>[0]);

		// Start the channel -> this triggers recovery
		await channel.start();

		// 3. Verify that no sendMessage was called (since it should be silently discarded)
		expect(apiCalls.some((c) => c.method === "sendMessage")).toBe(false);

		// Verify stream buffer has been deleted from StateManager
		const streamsOnDisk = await StateManager.getTelegramStreams();
		expect(streamsOnDisk).toHaveLength(0);

		await channel.stop();
	});

	describe("Out-of-band Native Bot Commands Menu", () => {
		it("should intercept /help and /start commands and reply with the commands list", async () => {
			const { channel, bot } = setupChannel(["*"]);
			await channel.start();

			const apiCalls: { method: string; payload: Record<string, unknown> }[] =
				[];
			bot.api.config.use((async (
				_prev: unknown,
				method: string,
				payload: unknown,
			) => {
				apiCalls.push({ method, payload: payload as Record<string, unknown> });
				return { ok: true, result: {} };
			}) as unknown as Parameters<Bot["api"]["config"]["use"]>[0]);

			const helpUpdate = makeMessageUpdate(
				{
					message_id: 101,
					text: "/help",
				},
				{
					update_id: 20001,
				},
			);

			await bot.handleUpdate(helpUpdate);

			expect(apiCalls).toHaveLength(1);
			expect(apiCalls[0].method).toBe("sendMessage");
			expect(apiCalls[0].payload.text).toContain("Miniclaw Bot Commands Menu");
			expect(apiCalls[0].payload.text).toContain("/new");
			expect(apiCalls[0].payload.text).toContain("/clear");
			expect(apiCalls[0].payload.text).toContain("/stop");

			await channel.stop();
		});

		it("should intercept /status and return correct status details", async () => {
			const mockAgentLoop = {
				cancelChat: vi.fn().mockResolvedValue(true),
				isChatActive: vi.fn().mockReturnValue(true),
				config: {
					agent: { model: "gemma2", reasoning_effort: "medium" },
					workspace_dir: "/path/to/workspace",
				},
			} as unknown as AgentLoop;

			const { channel, bot } = setupChannel(["*"], mockAgentLoop);
			await channel.start();

			const apiCalls: { method: string; payload: Record<string, unknown> }[] =
				[];
			bot.api.config.use((async (
				_prev: unknown,
				method: string,
				payload: unknown,
			) => {
				apiCalls.push({ method, payload: payload as Record<string, unknown> });
				return { ok: true, result: {} };
			}) as unknown as Parameters<Bot["api"]["config"]["use"]>[0]);

			const statusUpdate = makeMessageUpdate(
				{
					message_id: 102,
					text: "/status",
				},
				{
					update_id: 20002,
				},
			);

			await bot.handleUpdate(statusUpdate);

			expect(apiCalls).toHaveLength(1);
			expect(apiCalls[0].method).toBe("sendMessage");
			expect(apiCalls[0].payload.text).toContain("Miniclaw Bot Status");
			expect(apiCalls[0].payload.text).toContain("gemma2");
			expect(apiCalls[0].payload.text).toContain("medium");
			expect(apiCalls[0].payload.text).toContain("ACTIVE");
			expect(apiCalls[0].payload.text).toContain("/path/to/workspace");

			await channel.stop();
		});

		it("should intercept /stop and cancel active execution in agent loop", async () => {
			const mockAgentLoop = {
				cancelChat: vi.fn().mockResolvedValue(true),
				isChatActive: vi.fn().mockReturnValue(true),
			} as unknown as AgentLoop;

			const { channel, bot } = setupChannel(["*"], mockAgentLoop);
			await channel.start();

			const apiCalls: { method: string; payload: Record<string, unknown> }[] =
				[];
			bot.api.config.use((async (
				_prev: unknown,
				method: string,
				payload: unknown,
			) => {
				apiCalls.push({ method, payload: payload as Record<string, unknown> });
				return { ok: true, result: {} };
			}) as unknown as Parameters<Bot["api"]["config"]["use"]>[0]);

			const stopUpdate = makeMessageUpdate(
				{
					message_id: 103,
					text: "/stop",
				},
				{
					update_id: 20003,
				},
			);

			await bot.handleUpdate(stopUpdate);

			expect(mockAgentLoop.cancelChat).toHaveBeenCalledWith("12345");
			expect(apiCalls).toHaveLength(1);
			expect(apiCalls[0].method).toBe("sendMessage");
			expect(apiCalls[0].payload.text).toBe("Stopped active execution.");

			await channel.stop();
		});

		it("should intercept /new, cancel active executions, and archive active history", async () => {
			const mockAgentLoop = {
				cancelChat: vi.fn().mockResolvedValue(true),
				isChatActive: vi.fn().mockReturnValue(false),
			} as unknown as AgentLoop;

			const { channel, bot } = setupChannel(["*"], mockAgentLoop);
			await channel.start();

			// Pre-create active checkpoint file
			const sessionsDir = path.join(getAppDir(), "sessions", "12345");
			fs.mkdirSync(sessionsDir, { recursive: true });
			const checkpointFile = path.join(sessionsDir, "checkpoint.json");
			fs.writeFileSync(checkpointFile, JSON.stringify({ storage: { x: 1 } }));

			const apiCalls: { method: string; payload: Record<string, unknown> }[] =
				[];
			bot.api.config.use((async (
				_prev: unknown,
				method: string,
				payload: unknown,
			) => {
				apiCalls.push({ method, payload: payload as Record<string, unknown> });
				return { ok: true, result: {} };
			}) as unknown as Parameters<Bot["api"]["config"]["use"]>[0]);

			const newUpdate = makeMessageUpdate(
				{
					message_id: 104,
					text: "/new",
				},
				{
					update_id: 20004,
				},
			);

			await bot.handleUpdate(newUpdate);

			expect(mockAgentLoop.cancelChat).toHaveBeenCalledWith("12345");
			expect(apiCalls).toHaveLength(1);
			expect(apiCalls[0].method).toBe("sendMessage");
			expect(apiCalls[0].payload.text).toContain("New session started");

			// Check that checkpoint.json is renamed to checkpoint_timestamp.json
			expect(fs.existsSync(checkpointFile)).toBe(false);
			const files = fs.readdirSync(sessionsDir);
			const archived = files.find(
				(f) => f.startsWith("checkpoint_") && f.endsWith(".json"),
			);
			expect(archived).toBeDefined();

			await channel.stop();
		});

		it("should intercept /clear, cancel active executions, and delete checkpoint file completely", async () => {
			const mockAgentLoop = {
				cancelChat: vi.fn().mockResolvedValue(true),
				isChatActive: vi.fn().mockReturnValue(false),
			} as unknown as AgentLoop;

			const { channel, bot } = setupChannel(["*"], mockAgentLoop);
			await channel.start();

			// Pre-create session dir and some files
			const sessionsDir = path.join(getAppDir(), "sessions", "12345");
			fs.mkdirSync(sessionsDir, { recursive: true });
			fs.writeFileSync(path.join(sessionsDir, "checkpoint.json"), "log\n");
			fs.writeFileSync(
				path.join(sessionsDir, "checkpoint_123.json"),
				"oldlog\n",
			);

			const apiCalls: { method: string; payload: Record<string, unknown> }[] =
				[];
			bot.api.config.use((async (
				_prev: unknown,
				method: string,
				payload: unknown,
			) => {
				apiCalls.push({ method, payload: payload as Record<string, unknown> });
				return { ok: true, result: {} };
			}) as unknown as Parameters<Bot["api"]["config"]["use"]>[0]);

			const clearUpdate = makeMessageUpdate(
				{
					message_id: 105,
					text: "/clear",
				},
				{
					update_id: 20005,
				},
			);

			await bot.handleUpdate(clearUpdate);

			expect(mockAgentLoop.cancelChat).toHaveBeenCalledWith("12345");
			expect(apiCalls).toHaveLength(1);
			expect(apiCalls[0].method).toBe("sendMessage");
			expect(apiCalls[0].payload.text).toContain(
				"Session history wiped completely",
			);

			// Check that active session checkpoint file (checkpoint.json) is gone
			expect(fs.existsSync(path.join(sessionsDir, "checkpoint.json"))).toBe(
				false,
			);
			// Check that archived checkpoint file (checkpoint_123.json) is still intact
			expect(fs.existsSync(path.join(sessionsDir, "checkpoint_123.json"))).toBe(
				true,
			);

			await channel.stop();
		});

		it("should intercept /compact, cancel active executions, and compact active history if messages exist", async () => {
			const mockAgentLoop = {
				cancelChat: vi.fn().mockResolvedValue(true),
				isChatActive: vi.fn().mockReturnValue(false),
				config: {
					agent: { model: "gemma2" },
				},
			} as unknown as AgentLoop;

			const { channel, bot } = setupChannel(["*"], mockAgentLoop);
			await channel.start();

			const apiCalls: { method: string; payload: Record<string, unknown> }[] =
				[];
			bot.api.config.use((async (
				_prev: unknown,
				method: string,
				payload: unknown,
			) => {
				apiCalls.push({ method, payload: payload as Record<string, unknown> });
				return { ok: true, result: {} };
			}) as unknown as Parameters<Bot["api"]["config"]["use"]>[0]);

			// 1. Test compaction on empty history
			const compactUpdate = makeMessageUpdate(
				{
					message_id: 106,
					text: "/compact",
				},
				{
					update_id: 20006,
				},
			);

			await bot.handleUpdate(compactUpdate);

			expect(mockAgentLoop.cancelChat).toHaveBeenCalledWith("12345");
			expect(apiCalls).toHaveLength(1);
			expect(apiCalls[0].method).toBe("sendMessage");
			expect(apiCalls[0].payload.text).toContain(
				"No messages to compact in the active session",
			);

			await channel.stop();
		});
	});
});
