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
			"Reads a file from the filesystem. Supports pagination with offset (0-indexed line number to start reading from) and limit parameters to avoid context overflow. Only omit limit (read full file) when necessary for editing. Results are returned using cat -n format with line numbers starting at 1. Lines longer than 5,000 characters are split into multiple lines with continuation markers.",
		schema: z.object({
			file_path: z
				.string()
				.describe(
					"Absolute path to the file to read. Must be absolute, not relative.",
				),
			offset: z
				.number()
				.optional()
				.default(0)
				.describe(
					"Line number to start reading from (0-indexed). Use for pagination of large files.",
				),
			limit: z
				.number()
				.optional()
				.describe(
					"Maximum number of lines to read. Use for pagination of large files. Default is 100 when doing exploration.",
				),
		}),
		func: async ({ file_path: filePath, offset, limit }) => {
			try {
				const securePath = resolveSecurePath(workspaceDir, filePath);
				const content = await fs.readFile(securePath, "utf-8");

				if (content.length === 0) {
					return `System Reminder: The file at "${filePath}" exists but is empty.`;
				}

				const originalLines = content.split(/\r?\n/);
				const outputLines: Array<{ lineNumStr: string; text: string }> = [];

				for (let i = 0; i < originalLines.length; i++) {
					const lineNum = i + 1;
					const lineText = originalLines[i];

					if (lineText.length <= 5000) {
						outputLines.push({
							lineNumStr: String(lineNum),
							text: lineText,
						});
					} else {
						let chunkIdx = 1;
						for (let charIdx = 0; charIdx < lineText.length; charIdx += 5000) {
							const chunk = lineText.substring(charIdx, charIdx + 5000);
							outputLines.push({
								lineNumStr: `${lineNum}.${chunkIdx}`,
								text: chunk,
							});
							chunkIdx++;
						}
					}
				}

				const totalOutputLines = outputLines.length;
				const startIdx = Math.max(0, offset);

				let endIdx = totalOutputLines;
				if (limit !== undefined) {
					endIdx = startIdx + limit;
				}

				const slicedLines = outputLines.slice(startIdx, endIdx);
				const formattedLines = slicedLines.map((line) => {
					const lineNumStr = line.lineNumStr.padStart(6, " ");
					return `${lineNumStr}  ${line.text}`;
				});

				const slicedContent = formattedLines.join("\n");

				let paginationMessage = "";
				if (limit !== undefined && startIdx + limit < totalOutputLines) {
					paginationMessage = `\n\n--- [TRUNCATED: File continues. Displayed lines ${startIdx + 1}-${startIdx + limit} of ${totalOutputLines} total lines. Use parameters 'offset' and 'limit' to read next pages.] ---`;
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
