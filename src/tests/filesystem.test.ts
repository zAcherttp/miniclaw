import fs from "node:fs/promises";
import path from "node:path";
import type { StructuredTool } from "@langchain/core/tools";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFilesystemTools } from "../agent/tools/filesystem";

describe("Secure Filesystem & Search Tools", () => {
	const testSandbox = path.resolve(__dirname, "tmp-sandbox");
	let readFileTool: StructuredTool;
	let writeFileTool: StructuredTool;
	let listFilesTool: StructuredTool;
	let grepSearchTool: StructuredTool;

	beforeAll(async () => {
		// Clean and recreate sandbox directory
		await fs.rm(testSandbox, { recursive: true, force: true });
		await fs.mkdir(testSandbox, { recursive: true });

		// Initialize sandboxed tools with mock sandbox root
		const tools = createFilesystemTools(testSandbox);
		readFileTool = tools[0];
		writeFileTool = tools[1];
		listFilesTool = tools[2];
		grepSearchTool = tools[3];
	});

	afterAll(async () => {
		// Clean up sandbox directory
		await fs.rm(testSandbox, { recursive: true, force: true });
	});

	describe("write_file", () => {
		it("should write a file successfully and automatically create folders", async () => {
			const res = await writeFileTool.invoke({
				path: "subfolder/test.txt",
				content: "Line 1\nLine 2\nLine 3\nLine 4\nLine 5",
			});
			expect(res).toContain("File written successfully");

			// Check file existence
			const data = await fs.readFile(
				path.join(testSandbox, "subfolder/test.txt"),
				"utf-8",
			);
			expect(data).toBe("Line 1\nLine 2\nLine 3\nLine 4\nLine 5");
		});

		it("should reject path traversal with a soft security error string", async () => {
			const res = await writeFileTool.invoke({
				path: "../unsafe.txt",
				content: "hack",
			});
			expect(res).toContain("Security Violation");
		});
	});

	describe("read_file with pagination", () => {
		it("should read full file by default", async () => {
			const res = await readFileTool.invoke({
				path: "subfolder/test.txt",
			});
			expect(res).toBe("Line 1\nLine 2\nLine 3\nLine 4\nLine 5");
		});

		it("should slice by startLine and endLine", async () => {
			const res = await readFileTool.invoke({
				path: "subfolder/test.txt",
				startLine: 2,
				endLine: 4,
			});
			// It appends a truncation warning because total lines > 4 (the end line)
			expect(res).toContain("Line 2\nLine 3\nLine 4");
			expect(res).toContain("TRUNCATED");
		});

		it("should slice by offset and limit", async () => {
			const res = await readFileTool.invoke({
				path: "subfolder/test.txt",
				offset: 2, // starts at index 2 (Line 3, 1-indexed line 3)
				limit: 2,
			});
			expect(res).toContain("Line 3\nLine 4");
			expect(res).toContain("TRUNCATED");
		});

		it("should reject path traversal gracefully", async () => {
			const res = await readFileTool.invoke({
				path: "../../tsconfig.json",
			});
			expect(res).toContain("Security Violation");
		});
	});

	describe("list_files", () => {
		it("should list directories and files correctly", async () => {
			const res = await listFilesTool.invoke({
				path: ".",
			});
			const list = JSON.parse(res);
			expect(list).toContainEqual({
				name: "subfolder",
				type: "directory",
			});
		});

		it("should reject path traversal gracefully", async () => {
			const res = await listFilesTool.invoke({
				path: "../",
			});
			expect(res).toContain("Security Violation");
		});
	});

	describe("grep_search", () => {
		it("should recursively find query in files inside workspace", async () => {
			const res = await grepSearchTool.invoke({
				query: "Line 3",
				path: ".",
			});
			const matches = JSON.parse(res);
			expect(matches.length).toBe(1);
			expect(matches[0].file).toBe(path.join("subfolder", "test.txt"));
			expect(matches[0].lineNumber).toBe(3);
			expect(matches[0].content).toBe("Line 3");
		});

		it("should reject path traversal in grep_search gracefully", async () => {
			const res = await grepSearchTool.invoke({
				query: "test",
				path: "../",
			});
			expect(res).toContain("Security Violation");
		});
	});
});
