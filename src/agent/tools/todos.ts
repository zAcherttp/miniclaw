import fs from "node:fs/promises";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { resolveSecurePath } from "../security";

/**
 * ============================================================================
 * SECURE TODO TRACKING TOOL DOCUMENTATION
 * ============================================================================
 * This tool allows the agent to create and update a stateful checklist (.todos.json)
 * inside the active workspace directory to plan and track execution steps.
 *
 * Architecture and Runtime Guards:
 *
 * ```mermaid
 * graph TD
 *     subgraph Input_Validation["1. Input Parsing & Validation"]
 *         A["Agent issues write_todos(todos)"] --> B["Validate Todo Array Structure<br/>(id, text, status, note)"]
 *     end
 *
 *     subgraph Secure_Resolution["2. Safe Path Resolution"]
 *         B --> C["resolveSecurePath(workspaceDir, '.todos.json')"]
 *         C -->|Security Violations| D["Abort: Throw PathTraversalError"]
 *         C -->|Secure Path Verified| E[".todos.json absolute target resolved"]
 *     end
 *
 *     subgraph File_Writing["3. Stateful Disk Writing"]
 *         E --> F["JSON.stringify(todos, null, 2)"]
 *         F --> G["fs.writeFile() to workspace root"]
 *         G --> H["Return Successful Confirmation to Loop"]
 *     end
 * ```
 * ============================================================================
 */

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
