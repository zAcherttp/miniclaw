import fs from "node:fs/promises";
import path from "node:path";
import type { StructuredTool } from "@langchain/core/tools";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFilesystemTools } from "../agent/tools/filesystem";

describe("Secure Filesystem & Search Tools", () => {
	const testSandbox = path.resolve(__dirname, "tmp-sandbox");
	let readFileTool: StructuredTool;
	let writeFileTool: StructuredTool;
	let editFileTool: StructuredTool;
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
		editFileTool = tools[2];
		listFilesTool = tools[3];
		grepSearchTool = tools[4];
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
				file_path: "subfolder/test.txt",
			});
			expect(res).toBe(
				"     1  Line 1\n     2  Line 2\n     3  Line 3\n     4  Line 4\n     5  Line 5",
			);
		});

		it("should slice by offset and limit", async () => {
			const res = await readFileTool.invoke({
				file_path: "subfolder/test.txt",
				offset: 2, // starts at 0-indexed line 2 (Line 3)
				limit: 2,
			});
			expect(res).toContain("     3  Line 3\n     4  Line 4");
			expect(res).toContain("TRUNCATED");
		});

		it("should handle empty files gracefully", async () => {
			await writeFileTool.invoke({
				path: "empty.txt",
				content: "",
			});
			const res = await readFileTool.invoke({
				file_path: "empty.txt",
			});
			expect(res).toContain(
				'System Reminder: The file at "empty.txt" exists but is empty.',
			);
		});

		it("should split long lines (>5000 chars) with continuation markers", async () => {
			const longLine = "A".repeat(12000);
			await writeFileTool.invoke({
				path: "long.txt",
				content: longLine,
			});
			const res = await readFileTool.invoke({
				file_path: "long.txt",
			});
			const lines = res.split("\n");
			expect(lines).toHaveLength(3);
			expect(lines[0]).toContain("   1.1  ");
			expect(lines[1]).toContain("   1.2  ");
			expect(lines[2]).toContain("   1.3  ");
			expect(lines[0].trim().split(/\s+/)[1].length).toBe(5000);
			expect(lines[1].trim().split(/\s+/)[1].length).toBe(5000);
			expect(lines[2].trim().split(/\s+/)[1].length).toBe(2000);
		});

		it("should reject path traversal gracefully", async () => {
			const res = await readFileTool.invoke({
				file_path: "../../tsconfig.json",
			});
			expect(res).toContain("Security Violation");
		});
	});

	describe("edit_file", () => {
		it("should replace a unique string match in a file", async () => {
			await writeFileTool.invoke({
				path: "editable.txt",
				content: "Hello World\nFoo Bar\nBaz Qux",
			});

			const res = await editFileTool.invoke({
				file_path: "editable.txt",
				old_string: "Foo Bar",
				new_string: "Foo Updated",
			});
			expect(res).toContain('Successfully edited "editable.txt"');
			expect(res).toContain("line 2");

			const content = await fs.readFile(
				path.join(testSandbox, "editable.txt"),
				"utf-8",
			);
			expect(content).toBe("Hello World\nFoo Updated\nBaz Qux");
		});

		it("should reject ambiguous edits when old_string appears multiple times", async () => {
			await writeFileTool.invoke({
				path: "dupes.txt",
				content: "apple banana\napple cherry\napple date",
			});

			const res = await editFileTool.invoke({
				file_path: "dupes.txt",
				old_string: "apple",
				new_string: "orange",
			});
			expect(res).toContain("appears 3 times");
			expect(res).toContain("ambiguous");

			// Verify file was NOT modified
			const content = await fs.readFile(
				path.join(testSandbox, "dupes.txt"),
				"utf-8",
			);
			expect(content).toBe("apple banana\napple cherry\napple date");
		});

		it("should return an error when old_string is not found", async () => {
			const res = await editFileTool.invoke({
				file_path: "editable.txt",
				old_string: "NONEXISTENT_TEXT",
				new_string: "replacement",
			});
			expect(res).toContain("old_string not found");
			expect(res).toContain("First ");
		});

		it("should delete text when new_string is empty", async () => {
			await writeFileTool.invoke({
				path: "deletable.txt",
				content: "keep this\nremove this line\nkeep this too",
			});

			const res = await editFileTool.invoke({
				file_path: "deletable.txt",
				old_string: "\nremove this line",
				new_string: "",
			});
			expect(res).toContain("Successfully deleted");

			const content = await fs.readFile(
				path.join(testSandbox, "deletable.txt"),
				"utf-8",
			);
			expect(content).toBe("keep this\nkeep this too");
		});

		it("should reject path traversal gracefully", async () => {
			const res = await editFileTool.invoke({
				file_path: "../../etc/passwd",
				old_string: "root",
				new_string: "hacked",
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
