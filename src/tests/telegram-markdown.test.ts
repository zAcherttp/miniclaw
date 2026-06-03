/**
 * Pure unit tests for the toMarkdownV2 formatter.
 * Intentionally kept in a separate file from telegram.test.ts to avoid
 * loading the grammy + langchain module graph in this lightweight worker.
 */
import { describe, expect, it } from "vitest";
import { toMarkdownV2 } from "@/channels/telegram";

describe("toMarkdownV2 Parser", () => {
	it("should escape special characters in plain text", () => {
		expect(toMarkdownV2("Hello. World!")).toBe("Hello\\. World\\!");
		expect(toMarkdownV2("Task [1]: done.")).toBe("Task \\[1\\]: done\\.");
	});

	it("should convert bold markdown from double stars to single stars", () => {
		expect(toMarkdownV2("This is **bold** text")).toBe("This is *bold* text");
	});

	it("should convert italic markdown to single underscore", () => {
		expect(toMarkdownV2("This is *italic* and _italic_ text")).toBe(
			"This is _italic_ and _italic_ text",
		);
	});

	it("should handle nested bold and italic tags", () => {
		expect(toMarkdownV2("This is **bold and *italic* nested**")).toBe(
			"This is *bold and _italic_ nested*",
		);
	});

	it("should preserve code blocks but escape backslashes and backticks inside them", () => {
		const input = "```js\nconst x = `hello \\ world`;\n```";
		const expected = "```js\nconst x = \\`hello \\\\ world\\`;\n```";
		expect(toMarkdownV2(input)).toBe(expected);
	});

	it("should preserve inline code but escape backslashes and backticks inside them", () => {
		expect(toMarkdownV2("Use `x \\ y` code")).toBe("Use `x \\\\ y` code");
	});

	it("should convert markdown links and format labels recursively", () => {
		expect(toMarkdownV2("[Click *here*!](http://example.com/foo)")).toBe(
			"[Click _here_\\!](http://example.com/foo)",
		);
	});

	it("should escape list markers and avoid parsing list bullets as bold/italic", () => {
		expect(toMarkdownV2("* item 1\n* item 2")).toBe("\\* item 1\n\\* item 2");
		expect(toMarkdownV2("- item 1\n- item 2")).toBe("\\- item 1\n\\- item 2");
		expect(toMarkdownV2("1. item 1\n2. item 2")).toBe(
			"1\\. item 1\n2\\. item 2",
		);
	});
});
