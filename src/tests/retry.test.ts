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
	createConsolidationAgent: vi
		.fn()
		.mockImplementation(
			async (_config, _workspaceDir, chatId, bus, channel) => {
				const { DynamicStructuredTool } = await import("@langchain/core/tools");
				const { z } = await import("zod");
				const { StateManager } = await import("@/agent/state");
				const { logger } = await import("@/utils/logger");

				const concludeConsolidationTool = new DynamicStructuredTool({
					name: "conclude_consolidation",
					description:
						"Concludes the consolidation flow and restores the main agent.",
					schema: z.object({
						action: z.enum(["save", "discard"]),
					}),
					func: async ({ action }) => {
						try {
							const condState =
								await StateManager.getConsolidationState(chatId);
							const targetCount = condState?.checkpointMessageCount;

							if (typeof targetCount === "number" && targetCount >= 0) {
								const { FileCheckpointSaver } = await import("@/agent/store");
								const checkpointer = new FileCheckpointSaver(chatId);
								await checkpointer.load();
								if (targetCount < checkpointer.messages.length) {
									checkpointer.messages = checkpointer.messages.slice(
										0,
										targetCount,
									);
									await checkpointer.save();
									logger.info(
										`[Consolidation] Wiped consolidation messages from checkpoint for chat ${chatId}. Restored base count: ${targetCount}`,
									);
								}
							}

							await StateManager.clearConsolidationState(chatId);
							if (bus && channel) {
								const replyText =
									action === "save"
										? "Workflow saved successfully. Control returned to main agent."
										: "Workflow discarded. Control returned to main agent.";
								await bus.publishOutbound({
									channel,
									chat_id: chatId,
									content: replyText,
								});
							}
							if (condState?.pendingRequest) {
								await bus.publishInbound(condState.pendingRequest);
							}
							return `Consolidation concluded with action "${action}". Control returned to main agent.`;
						} catch (err) {
							return `Error concluding consolidation: ${(err as Error).message}`;
						}
					},
				});

				return {
					options: {
						model: "ollama:gemma2",
						tools: [concludeConsolidationTool],
					},
				};
			},
		),
	CONSOLIDATION_SYSTEM_PROMPT: "Mock prompt {{PROPOSED_WORKFLOW}}",
}));

vi.mock("@/agent/models", () => ({
	createChatModel: vi.fn().mockResolvedValue({
		invoke: vi.fn().mockResolvedValue({ content: "{}" }),
	}),
}));

// Sandbox homedir to isolate checkpoints
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-retry-"));

import { AgentLoop } from "@/agent/loop";
import { StateManager } from "@/agent/state";
import { MessageBus } from "@/bus/queue";
import type { AppConfig } from "@/config/schema";

describe("Queue-based Inbound Retry & Recovery", () => {
	let bus: MessageBus;
	let config: AppConfig;

	beforeEach(async () => {
		vi.spyOn(os, "homedir").mockReturnValue(tempHome);
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

		// Pre-populate last cron dates to prevent daily cron from running in general tests
		const todayStr = new Date().toISOString().split("T")[0];
		await StateManager.saveLastCronDate("chat123", todayStr);
		await StateManager.saveLastCronDate("chat999", todayStr);
		await StateManager.saveLastCronDate("chatWipe", todayStr);
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

	it("should route messages to the consolidation agent when active consolidation is in state", async () => {
		const { createConsolidationAgent } = await import("@/agent/agents");

		// 1. Enable consolidation state in StateManager
		await StateManager.saveConsolidationState("chat123", {
			active: true,
			proposedWorkflow: "mock-workflow-content",
		});

		const agentLoop = new AgentLoop(config, bus);
		await agentLoop.start();

		// 2. Publish inbound request
		await bus.publishInbound({
			channel: "telegram",
			sender_id: "user1",
			chat_id: "chat123",
			content: "yes, save it",
			metadata: { message_id: "101" },
		});

		// Wait for processing (debounce = 250ms)
		await new Promise((resolve) => setTimeout(resolve, 300));

		// 3. Verify consolidation agent was created and graph invoke was triggered with it
		expect(createConsolidationAgent).toHaveBeenCalledWith(
			config,
			expect.any(String),
			"chat123",
			bus,
			"telegram",
		);
		expect(mockGraphInvoke).toHaveBeenCalled();

		// Clean up State
		await StateManager.clearConsolidationState("chat123");
		await agentLoop.stop();
	});

	it("should publish a switch message when transitioning between agents", async () => {
		const publishOutboundSpy = vi.spyOn(bus, "publishOutbound");

		const agentLoop = new AgentLoop(config, bus);
		await agentLoop.start();

		// 1. First request runs as "main" agent by default.
		// Since it's the first message, lastActiveAgentType is initialized to "main", so no switch message is sent.
		await bus.publishInbound({
			channel: "telegram",
			sender_id: "user1",
			chat_id: "chat123",
			content: "hello main",
			metadata: { message_id: "101" },
		});
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(publishOutboundSpy).not.toHaveBeenCalledWith(
			expect.objectContaining({
				content: expect.stringContaining("You are now talking with"),
			}),
		);

		// 2. Set consolidation state to active.
		await StateManager.saveConsolidationState("chat123", {
			active: true,
			proposedWorkflow: "mock-workflow-content",
		});

		// 3. Send next message. It should switch to "consolidation" agent and send the switch message.
		await bus.publishInbound({
			channel: "telegram",
			sender_id: "user1",
			chat_id: "chat123",
			content: "yes, save it",
			metadata: { message_id: "102" },
		});
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(publishOutboundSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				content: "You are now talking with consolidation agent.",
				chat_id: "chat123",
			}),
		);

		// 4. Clear consolidation state.
		await StateManager.clearConsolidationState("chat123");
		publishOutboundSpy.mockClear();

		// 5. Send next message. It should switch back to "main" agent and send the switch message.
		await bus.publishInbound({
			channel: "telegram",
			sender_id: "user1",
			chat_id: "chat123",
			content: "hello main again",
			metadata: { message_id: "103" },
		});
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(publishOutboundSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				content: "You are now talking with main agent.",
				chat_id: "chat123",
			}),
		);

		await agentLoop.stop();
	});

	it("should wipe consolidation traces from the main checkpoint when conclude_consolidation is called", async () => {
		const { createConsolidationAgent } = await import("@/agent/agents");
		const { FileCheckpointSaver } = await import("@/agent/store");
		const { HumanMessage } = await import("@langchain/core/messages");

		const agentLoop = new AgentLoop(config, bus);
		await agentLoop.start();

		// 1. Initial messages in main chat
		const checkpointer = new FileCheckpointSaver("chatWipe");
		checkpointer.messages = [new HumanMessage("hello main")];
		await checkpointer.save();

		const initialLength = checkpointer.messages.length;

		// 2. Activate consolidation state
		await StateManager.saveConsolidationState("chatWipe", {
			active: true,
			proposedWorkflow: "mock-workflow-content",
		});

		// 3. Send a message to run consolidation agent
		await bus.publishInbound({
			channel: "telegram",
			sender_id: "user1",
			chat_id: "chatWipe",
			content: "yes, save it",
			metadata: { message_id: "104" },
		});
		await new Promise((resolve) => setTimeout(resolve, 300));

		// Verify checkpointMessageCount is saved correctly in the state
		const condState = await StateManager.getConsolidationState("chatWipe");
		expect(condState?.checkpointMessageCount).toBe(initialLength);

		// Verify messages list in checkpointer currently has the consolidation messages (which includes "yes, save it")
		await checkpointer.load();
		expect(checkpointer.messages.length).toBeGreaterThan(initialLength);

		// 4. Conclude consolidation manually by getting the compiled consolidation agent tools
		// and invoking conclude_consolidation tool
		const agentInstance = await createConsolidationAgent(
			config,
			config.workspace_dir,
			"chatWipe",
			bus,
			"telegram",
		);
		const concludeTool = agentInstance.options.tools?.find(
			(t: { name: string }) => t.name === "conclude_consolidation",
		);
		expect(concludeTool).toBeDefined();

		// Invoke conclude_consolidation tool
		await concludeTool.invoke({ action: "save" });

		// 5. Verify consolidation messages are wiped and length returns to initialLength
		await checkpointer.load();
		expect(checkpointer.messages.length).toBe(initialLength);
		expect(checkpointer.messages[0].content).toBe("hello main");

		await agentLoop.stop();
	});

	it("should save the pending request in consolidation state and re-publish it to the inbound queue when conclude_consolidation is invoked", async () => {
		const { createConsolidationAgent } = await import("@/agent/agents");

		const pendingMsg = {
			channel: "telegram",
			sender_id: "user1",
			chat_id: "chatWipe",
			content: "what can you do",
			metadata: { message_id: "105" },
		};

		// 1. Activate consolidation state with the pending request
		await StateManager.saveConsolidationState("chatWipe", {
			active: true,
			proposedWorkflow: "mock-workflow-content",
			checkpointMessageCount: 1,
			pendingRequest: pendingMsg,
		});

		// 2. Instantiate consolidation agent
		const agentInstance = await createConsolidationAgent(
			config,
			config.workspace_dir,
			"chatWipe",
			bus,
			"telegram",
		);
		const concludeTool = agentInstance.options.tools?.find(
			(t: { name: string }) => t.name === "conclude_consolidation",
		);
		expect(concludeTool).toBeDefined();

		// 3. Invoke conclude_consolidation tool
		await concludeTool.invoke({ action: "save" });

		// 4. Verify original user request was re-published to the inbound queue
		const recovered = await bus.consumeInbound();
		expect(recovered.content).toBe("what can you do");
		expect(recovered.chat_id).toBe("chatWipe");
	});

	it("should run unified compaction daily cron when date changes", async () => {
		const publishOutboundSpy = vi.spyOn(bus, "publishOutbound");
		mockGraphInvoke.mockClear();

		const agentLoop = new AgentLoop(config, bus);
		await agentLoop.start();

		// Pre-populate checkpoint message
		const { FileCheckpointSaver } = await import("@/agent/store");
		const { HumanMessage } = await import("@langchain/core/messages");
		const checkpointer = new FileCheckpointSaver("chatCron");
		checkpointer.messages = [new HumanMessage("hello world")];
		await checkpointer.save();

		// We do NOT save the last cron date, so it's null (different from today).
		// When we publish an inbound message, the daily cron should trigger.
		await bus.publishInbound({
			channel: "telegram",
			sender_id: "user1",
			chat_id: "chatCron",
			content: "run cron turn",
			metadata: { message_id: "105" },
		});
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Verify the daily cron ran, compacted history, and updated state date
		const lastRunDate = await StateManager.getLastCronDate("chatCron");
		expect(lastRunDate).toBe(new Date().toISOString().split("T")[0]);

		// Verify the outbound compaction message was sent
		expect(publishOutboundSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				content: expect.stringContaining("Conversation compacted:"),
				chat_id: "chatCron",
			}),
		);

		// Since no workflow was extracted, the main agent should be invoked
		expect(mockGraphInvoke).toHaveBeenCalled();

		await agentLoop.stop();
	});

	it("should bypass agent execution if daily compaction cron activates consolidation", async () => {
		const { createChatModel } = await import("@/agent/models");

		// Mock the LLM to return a valid workflow, triggering consolidation
		const mockInvoke = vi.fn().mockResolvedValue({
			content: JSON.stringify({
				profile: { username: "testuser" },
				workflow: `---\nname: workflow-test\ndescription: test\n---\ntest content`,
			}),
		});
		vi.mocked(createChatModel).mockResolvedValue({
			invoke: mockInvoke,
		} as any);

		mockGraphInvoke.mockClear();

		const agentLoop = new AgentLoop(config, bus);
		await agentLoop.start();

		// Pre-populate checkpoint message
		const { FileCheckpointSaver } = await import("@/agent/store");
		const { HumanMessage } = await import("@langchain/core/messages");
		const checkpointer = new FileCheckpointSaver("chatCronBypass");
		checkpointer.messages = [new HumanMessage("hello world")];
		await checkpointer.save();

		// Trigger daily cron with an inbound message
		await bus.publishInbound({
			channel: "telegram",
			sender_id: "user1",
			chat_id: "chatCronBypass",
			content: "run cron turn",
			metadata: { message_id: "106" },
		});

		// Wait for the loop to process the message
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Verify consolidation state was activated
		const condState = await StateManager.getConsolidationState("chatCronBypass");
		expect(condState).not.toBeNull();
		expect(condState?.active).toBe(true);

		// Verify the main agent Graph invoke was bypassed (not called)
		expect(mockGraphInvoke).not.toHaveBeenCalled();

		await agentLoop.stop();
	});
});
