import fs from "node:fs/promises";
import path from "node:path";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { PathTraversalError, resolveSecurePath } from "../security";

/**
 * Pure JavaScript recursive text search restricted strictly to the workspace directory.
 * Does not spawn external processes. Capped to prevent memory overload.
 */
async function secureGrep(
	workspaceDir: string,
	query: string,
	searchSubpath = ".",
): Promise<Array<{ file: string; lineNumber: number; content: string }>> {
	let securePath: string;
	try {
		securePath = resolveSecurePath(workspaceDir, searchSubpath);
	} catch (err: unknown) {
		// Return friendly message back to the agent instead of throwing/crashing
		return [
			{
				file: "security_violation",
				lineNumber: 0,
				content: (err as Error).message,
			},
		];
	}

	const results: Array<{ file: string; lineNumber: number; content: string }> =
		[];

	async function traverse(dir: string) {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);

			if (entry.isDirectory()) {
				// Skip common heavy directories
				if (
					entry.name === "node_modules" ||
					entry.name === ".git" ||
					entry.name === "dist" ||
					entry.name === "media"
				) {
					continue;
				}
				await traverse(fullPath);
			} else if (entry.isFile()) {
				try {
					const content = await fs.readFile(fullPath, "utf-8");
					const lines = content.split(/\r?\n/);
					for (let i = 0; i < lines.length; i++) {
						if (lines[i].toLowerCase().includes(query.toLowerCase())) {
							results.push({
								file: path.relative(workspaceDir, fullPath),
								lineNumber: i + 1,
								content: lines[i].trim(),
							});
							if (results.length >= 100) return; // Cap safety
						}
					}
				} catch {
					// Silent ignore binary or unreadable files
				}
			}
		}
	}

	await traverse(securePath);
	return results;
}

export const createFilesystemTools = (workspaceDir: string) => {
	// 1. read_file tool with pagination/window parameters
	const readFileTool = new DynamicStructuredTool({
		name: "read_file",
		description:
			"Reads a text file's contents relative to the workspace. Supports startLine, endLine, offset, and limit for pagination to keep prompt token counts optimal.",
		schema: z.object({
			path: z
				.string()
				.describe("The file path to read (relative to the workspace)"),
			startLine: z
				.number()
				.optional()
				.default(1)
				.describe("The starting line number to read (1-indexed, inclusive)"),
			endLine: z
				.number()
				.optional()
				.describe("The ending line number to read (inclusive, 1-indexed)"),
			offset: z
				.number()
				.optional()
				.describe(
					"Line offset index to start reading from (0-indexed alternative)",
				),
			limit: z.number().optional().describe("Maximum number of lines to read"),
		}),
		func: async ({ path: filePath, startLine, endLine, offset, limit }) => {
			try {
				const securePath = resolveSecurePath(workspaceDir, filePath);
				const content = await fs.readFile(securePath, "utf-8");
				const lines = content.split(/\r?\n/);

				// Reconcile offset/limit and startLine/endLine
				let actualStart = startLine;
				if (offset !== undefined) {
					actualStart = offset + 1;
				}

				let actualEnd = endLine;
				if (limit !== undefined) {
					actualEnd = actualStart + limit - 1;
				}

				if (actualEnd === undefined) {
					actualEnd = actualStart + 999; // Default 1000 line window for protection
				}

				// Normalize bounds
				const totalLines = lines.length;
				const startIdx = Math.max(1, actualStart) - 1;
				const endIdx =
					Math.min(totalLines, Math.max(actualStart, actualEnd)) - 1;

				const slice = lines.slice(startIdx, endIdx + 1);
				const slicedContent = slice.join("\n");

				let paginationMessage = "";
				if (endIdx + 1 < totalLines) {
					paginationMessage = `\n\n--- [TRUNCATED: File continues. Displayed lines ${startIdx + 1}-${endIdx + 1} of ${totalLines} total lines. Use parameters 'startLine' or 'offset' and 'limit' to read next pages.] ---`;
				}

				return slicedContent + paginationMessage;
			} catch (err: unknown) {
				if (err instanceof PathTraversalError) {
					return err.message;
				}
				return `Error reading file: ${(err as Error).message}`;
			}
		},
	});

	// 2. write_file tool
	const writeFileTool = new DynamicStructuredTool({
		name: "write_file",
		description: "Creates or overwrites a file relative to the workspace.",
		schema: z.object({
			path: z
				.string()
				.describe("The file path to write to (relative to the workspace)"),
			content: z
				.string()
				.describe("The full text content to write to the file"),
		}),
		func: async ({ path: filePath, content }) => {
			try {
				const securePath = resolveSecurePath(workspaceDir, filePath);
				// Create parent directories if they don't exist
				await fs.mkdir(path.dirname(securePath), { recursive: true });
				await fs.writeFile(securePath, content, "utf-8");
				return `File written successfully to "${filePath}".`;
			} catch (err: unknown) {
				if (err instanceof PathTraversalError) {
					return err.message;
				}
				return `Error writing file: ${(err as Error).message}`;
			}
		},
	});

	// 3. list_files tool
	const listFilesTool = new DynamicStructuredTool({
		name: "list_files",
		description:
			"Lists files and directories inside a subdirectory relative to the workspace.",
		schema: z.object({
			path: z
				.string()
				.optional()
				.default(".")
				.describe("The subpath to list (defaults to workspace root '.')"),
		}),
		func: async ({ path: subpath }) => {
			try {
				const securePath = resolveSecurePath(workspaceDir, subpath);
				const entries = await fs.readdir(securePath, { withFileTypes: true });

				const list = entries.map((entry) => {
					return {
						name: entry.name,
						type: entry.isDirectory() ? "directory" : "file",
					};
				});

				return JSON.stringify(list, null, 2);
			} catch (err: unknown) {
				if (err instanceof PathTraversalError) {
					return err.message;
				}
				return `Error listing files: ${(err as Error).message}`;
			}
		},
	});

	// 4. grep_search tool (recursive, pure JS)
	const grepSearchTool = new DynamicStructuredTool({
		name: "grep_search",
		description:
			"Recursively searches text files within the workspace for occurrences of a case-insensitive query string.",
		schema: z.object({
			query: z.string().describe("The search term or text to look for"),
			path: z
				.string()
				.optional()
				.default(".")
				.describe("Optional subdirectory to narrow the search scope"),
		}),
		func: async ({ query, path: subpath }) => {
			try {
				const results = await secureGrep(workspaceDir, query, subpath);
				return JSON.stringify(results, null, 2);
			} catch (err: unknown) {
				return `Error searching: ${(err as Error).message}`;
			}
		},
	});

	return [readFileTool, writeFileTool, listFilesTool, grepSearchTool];
};
