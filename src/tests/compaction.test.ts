import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HumanMessage } from "@langchain/core/messages";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StateManager } from "@/agent/state";
import type { MessageBus } from "@/bus/queue";
import type { AppConfig } from "@/config/schema";

const mockSummarizationMiddleware = vi.fn().mockReturnValue({
	beforeModel: vi.fn().mockResolvedValue({
		messages: [{ type: "system", content: "Compacted summary context." }],
	}),
});

vi.mock("langchain", () => ({
	summarizationMiddleware: (...args: unknown[]) =>
		mockSummarizationMiddleware(...args),
}));

const mockModelInvoke = vi.fn();
vi.mock("@/agent/models", () => ({
	createChatModel: vi.fn().mockResolvedValue({
		invoke: (...args: unknown[]) => mockModelInvoke(...args),
	}),
}));

import { compactAndExtractWorkflows, forceCompactMessages } from "@/agent/compaction";

describe("CompactionManager & Skill Creator", () => {
	let tempDir: string;
	let config: AppConfig;
	let mockBus: MessageBus;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "miniclaw-compaction-test-"),
		);
		vi.spyOn(os, "homedir").mockReturnValue(tempDir);
		config = {
			agent: {
				model: "openai:gpt-4o",
				temperature: 0,
			},
			workspace_dir: tempDir,
		} as unknown as AppConfig;
		StateManager.filePath = path.join(tempDir, "state.json");
		mockBus = {
			publishOutbound: vi.fn().mockResolvedValue(undefined),
		} as unknown as MessageBus;
		vi.clearAllMocks();
	});

	afterEach(() => {
		StateManager.filePath = undefined;
		fs.rmSync(tempDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it("should perform standard summarization and not extract workflow when no new pattern is found", async () => {
		mockModelInvoke.mockResolvedValue({
			content: JSON.stringify({
				profile: {
					username: "testuser",
					timezone: "UTC",
					traits: ["Prefers TypeScript"],
					activeGoals: ["Learn testing"],
				},
				workflow: "NO_NEW_WORKFLOW",
			}),
		});

		// Pre-populate consolidation state to be active representing a previous state
		await StateManager.saveConsolidationState("test-chat", {
			active: true,
			proposedWorkflow: "previous-proposed-workflow",
		});

		const messages = [new HumanMessage("Hello, list my files please.")];

		const { compactedMessages, newWorkflowName } =
			await compactAndExtractWorkflows(
				config,
				messages,
				tempDir,
				"test-chat",
				"telegram",
				mockBus,
			);

		expect(newWorkflowName).toBeNull();
		expect(compactedMessages.length).toBe(2);
		expect(compactedMessages[1].content).toBe("Compacted summary context.");

		// Assert that consolidation state was toggled back to inactive (cleared)
		const condState = await StateManager.getConsolidationState("test-chat");
		expect(condState).toBeNull();
	});

	it("should extract new workflow and save to ConsolidationState when a reusable pattern is found", async () => {
		const mockWorkflowContent = `---
name: lark-freebusy
description: Check free/busy times in Lark
metadata:
  version: 1.0.0
  openclaw:
    category: workflow
    requires:
      bins:
        - lark-cli
---
# Check Free/Busy in Lark

Use lark-cli to query Lark calendar.`;

		mockModelInvoke.mockResolvedValue({
			content: JSON.stringify({
				profile: {
					username: "testuser",
					timezone: "UTC",
					traits: ["Prefers TypeScript"],
					activeGoals: ["Learn testing"],
				},
				workflow: mockWorkflowContent,
			}),
		});

		const messages = [
			new HumanMessage(
				"Please check if I am free tomorrow at 10 AM using lark-cli.",
			),
		];

		const result = await forceCompactMessages(
			config,
			messages,
			"test-chat",
			"telegram",
			mockBus,
		);

		expect(result).not.toBeNull();
		expect(result?.newWorkflow).toBe("workflow-lark-freebusy");

		// Assert that file is NOT written directly to disk (deferred to user consolidation response)
		const skillPath = path.join(
			tempDir,
			"workflows",
			"workflow-lark-freebusy",
			"SKILL.md",
		);
		expect(fs.existsSync(skillPath)).toBe(false);

		// Assert that it is saved in StateManager consolidation state
		const condState = await StateManager.getConsolidationState("test-chat");
		expect(condState).not.toBeNull();
		expect(condState?.active).toBe(true);
		expect(condState?.proposedWorkflow).toContain(
			"name: workflow-lark-freebusy",
		);

		// Assert outbound notification was sent to user
		expect(mockBus.publishOutbound).toHaveBeenCalledWith(
			expect.objectContaining({
				channel: "telegram",
				chat_id: "test-chat",
				content: expect.stringContaining(
					'compacting conversation and extracting workflows',
				),
			}),
		);
		expect(mockBus.publishOutbound).toHaveBeenCalledWith(
			expect.objectContaining({
				channel: "telegram",
				chat_id: "test-chat",
				content: expect.stringContaining(
					'conversation compacted:',
				),
			}),
		);
		expect(mockBus.publishOutbound).toHaveBeenCalledWith(
			expect.objectContaining({
				channel: "telegram",
				chat_id: "test-chat",
				content: expect.stringContaining(
					'identified a reusable workflow pattern: "workflow-lark-freebusy"',
				),
			}),
		);
	});
});
