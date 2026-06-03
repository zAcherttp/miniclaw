import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HumanMessage } from "@langchain/core/messages";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

import { compactAndExtractWorkflows } from "@/agent/compaction";

describe("CompactionManager & Skill Creator", () => {
	let tempDir: string;
	let config: AppConfig;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "miniclaw-compaction-test-"),
		);
		config = {
			agent: {
				model: "openai:gpt-4o",
				temperature: 0,
			},
			workspace_dir: tempDir,
		} as unknown as AppConfig;
		vi.clearAllMocks();
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it("should perform standard summarization and not extract workflow when no new pattern is found", async () => {
		mockModelInvoke.mockResolvedValue({ content: "NO_NEW_WORKFLOW" });

		const messages = [new HumanMessage("Hello, list my files please.")];

		const { compactedMessages, newWorkflowName } =
			await compactAndExtractWorkflows(config, messages, tempDir);

		expect(newWorkflowName).toBeNull();
		expect(compactedMessages.length).toBe(2);
		expect(compactedMessages[1].content).toBe("Compacted summary context.");
	});

	it("should extract new workflow and write SKILL.md when a reusable pattern is found", async () => {
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

		mockModelInvoke.mockResolvedValue({ content: mockWorkflowContent });

		const messages = [
			new HumanMessage(
				"Please check if I am free tomorrow at 10 AM using lark-cli.",
			),
		];

		const { newWorkflowName } = await compactAndExtractWorkflows(
			config,
			messages,
			tempDir,
		);

		expect(newWorkflowName).toBe("lark-freebusy");

		const skillPath = path.join(
			tempDir,
			"workflows",
			"lark-freebusy",
			"SKILL.md",
		);
		expect(fs.existsSync(skillPath)).toBe(true);

		const skillContent = fs.readFileSync(skillPath, "utf-8");
		expect(skillContent).toContain("name: lark-freebusy");
		expect(skillContent).toContain("category: workflow");
	});
});
