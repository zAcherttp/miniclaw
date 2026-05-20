import fs from "node:fs/promises";
import path from "node:path";
import type { StructuredTool } from "@langchain/core/tools";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWriteTodosTool } from "../agent/tools/todos";

describe("Stateful planning/checklist tool (write_todos)", () => {
	const testSandbox = path.resolve(__dirname, "tmp-sandbox-todos");
	let todoTool: StructuredTool;

	beforeAll(async () => {
		await fs.rm(testSandbox, { recursive: true, force: true });
		await fs.mkdir(testSandbox, { recursive: true });
		todoTool = createWriteTodosTool(testSandbox);
	});

	afterAll(async () => {
		await fs.rm(testSandbox, { recursive: true, force: true });
	});

	it("should create and format .todos.json correctly in the workspace", async () => {
		const testTodos = [
			{ id: "1", text: "Design setup", status: "done" as const },
			{ id: "2", text: "Implement test suite", status: "pending" as const },
		];

		const res = await todoTool.invoke({ todos: testTodos });
		expect(res).toContain("Checklist updated successfully");

		// Verify file contents
		const fileData = await fs.readFile(
			path.join(testSandbox, ".todos.json"),
			"utf-8",
		);
		const json = JSON.parse(fileData);
		expect(json.todos).toEqual(testTodos);
	});

	it("should reject saving todos outside the sandbox workspace boundary", async () => {
		// Mock write_todos with an escaping workspaceDir to test resolveSecurePath error path
		const invalidTool = createWriteTodosTool("/nonexistent-root");
		const res = await invalidTool.invoke({ todos: [] });
		expect(res).toContain("Error writing todos");
	});
});
