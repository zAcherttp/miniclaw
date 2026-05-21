import fs from "node:fs/promises";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { resolveSecurePath } from "../security";

const TodoItemSchema = z.object({
	id: z.string().describe("Unique identifier for the subtask"),
	text: z
		.string()
		.describe("Clear, actionable description of what this subtask does"),
	status: z
		.enum(["pending", "done", "blocked", "cancelled"])
		.describe("Status of the subtask"),
	note: z
		.string()
		.optional()
		.describe("Optional update note or block reason for this task"),
});

export const createWriteTodosTool = (workspaceDir: string) => {
	return new DynamicStructuredTool({
		name: "write_todos",
		description:
			"Updates or creates the stateful checklist of todos for tracking execution steps. Call this to outline your plan before coding, and to mark items as done as you complete them.",
		schema: z.object({
			todos: z
				.array(TodoItemSchema)
				.describe(
					"The complete list of todo checklist items representing the plan",
				),
		}),
		func: async ({ todos }) => {
			try {
				const securePath = resolveSecurePath(workspaceDir, ".todos.json");
				await fs.writeFile(
					securePath,
					JSON.stringify({ todos }, null, 2),
					"utf-8",
				);
				return "Checklist updated successfully in .todos.json.";
			} catch (err: unknown) {
				return `Error writing todos: ${(err as Error).message}`;
			}
		},
	});
};
