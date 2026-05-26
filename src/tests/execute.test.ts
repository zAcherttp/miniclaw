import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	ALLOWED_BINARIES,
	ExecuteSecurityError,
	validateExecuteCommand,
} from "../agent/security";
import { createExecuteTool } from "../agent/tools/execute";

beforeAll(() => {
	// Populate the allowed binaries whitelist for testing
	for (const binary of [
		"npm",
		"pnpm",
		"node",
		"vitest",
		"git",
		"python",
		"python3",
		"npx",
		"tsc",
		"biome",
	]) {
		ALLOWED_BINARIES.add(binary);
	}
});

afterAll(() => {
	// Clear it afterward to maintain empty production default
	ALLOWED_BINARIES.clear();
});

describe("Secure Execute Command Validator", () => {
	it("should allow valid whitelisted commands", () => {
		expect(() => validateExecuteCommand("npm test")).not.toThrow();
		expect(() => validateExecuteCommand("node src/index.ts")).not.toThrow();
		expect(() => validateExecuteCommand("git diff HEAD")).not.toThrow();
		expect(() => validateExecuteCommand("python --version")).not.toThrow();
		expect(() => validateExecuteCommand("tsc --noEmit")).not.toThrow();
		expect(() => validateExecuteCommand("biome check")).not.toThrow();
	});

	it("should allow commands with leading environment variables", () => {
		expect(() =>
			validateExecuteCommand("NODE_ENV=test vitest run"),
		).not.toThrow();
		expect(() =>
			validateExecuteCommand("A=1 B_C=2 node -e 'console.log(process.env.A)'"),
		).not.toThrow();
	});

	it("should reject non-whitelisted binaries", () => {
		expect(() => validateExecuteCommand("cat package.json")).toThrow(
			ExecuteSecurityError,
		);
		expect(() => validateExecuteCommand("rm -rf /")).toThrow(
			ExecuteSecurityError,
		);
		expect(() => validateExecuteCommand("curl google.com")).toThrow(
			ExecuteSecurityError,
		);
	});

	it("should reject path traversal attempts with '..'", () => {
		expect(() => validateExecuteCommand("node ../secrets.js")).toThrow(
			ExecuteSecurityError,
		);
		expect(() =>
			validateExecuteCommand("npm run test -- --file=../../etc/passwd"),
		).toThrow(ExecuteSecurityError);
	});

	it("should allow safe chains where all segments are whitelisted", () => {
		expect(() =>
			validateExecuteCommand("npm install && npm test"),
		).not.toThrow();
		expect(() =>
			validateExecuteCommand("git add . ; git commit -m 'test'"),
		).not.toThrow();
	});

	it("should block chains if any segment is not whitelisted", () => {
		expect(() => validateExecuteCommand("npm install && rm -rf /")).toThrow(
			ExecuteSecurityError,
		);
		expect(() => validateExecuteCommand("git status ; cat file.txt")).toThrow(
			ExecuteSecurityError,
		);
		expect(() => validateExecuteCommand("node -v || curl website")).toThrow(
			ExecuteSecurityError,
		);
	});
});

describe("Secure Execute Tool Integration", () => {
	const workspaceDir = path.resolve(".");
	const executeTool = createExecuteTool(workspaceDir);

	it("should execute valid whitelisted commands and format output correctly", async () => {
		const result = await executeTool.invoke({
			command: "node -e \"console.log('hello world')\"",
		});
		expect(result).toContain("hello world");
		expect(result).toContain("[Command succeeded with exit code 0]");
	});

	it("should capture and prefix stderr lines with [stderr]", async () => {
		const result = await executeTool.invoke({
			command: "node -e \"console.error('oops warning')\"",
		});
		expect(result).toContain("[stderr] oops warning");
		expect(result).toContain("[Command succeeded with exit code 0]");
	});

	it("should handle failing commands gracefully with error exit code", async () => {
		const result = await executeTool.invoke({
			command: 'node -e "process.exit(5)"',
		});
		expect(result).toContain("[Command failed with exit code 5]");
	});

	it("should enforce a strict timeout guard and terminate hung processes", async () => {
		// Create a separate tool with a short 2-second timeout for testing
		const shortTimeoutTool = createExecuteTool(workspaceDir, {
			timeoutMs: 2000,
		});
		const startTime = Date.now();
		const result = await shortTimeoutTool.invoke({
			command: 'node -e "setTimeout(() => {}, 10000)"',
		});
		const duration = Date.now() - startTime;

		expect(result).toContain("Command timed out");
		expect(duration).toBeLessThan(4000); // Must terminate in ~2 seconds
	}, 5000);

	it("should cap output buffer at 30KB and append truncation warnings", async () => {
		// Output ~32KB of data
		const codeStr = "node -e \"console.log('A'.repeat(32000))\"";
		const result = await executeTool.invoke({
			command: codeStr,
		});

		expect(result.length).toBeLessThan(35000); // 30,000 output + trailing messages
		expect(result).toContain("[Output was truncated due to size limits]");
		expect(result).toContain("... Output truncated");
	});
});
