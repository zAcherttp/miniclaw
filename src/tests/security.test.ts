import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PathTraversalError, resolveSecurePath } from "../agent/security";

describe("Path Sandboxing Primitive", () => {
	const workspaceDir = fs.mkdtempSync(
		path.join(os.tmpdir(), "miniclaw-security-"),
	);

	afterAll(() => {
		fs.rmSync(workspaceDir, { recursive: true, force: true });
	});

	it("should resolve safe relative paths within the workspace", () => {
		const safePath = "src/agent/loop.ts";
		const resolved = resolveSecurePath(workspaceDir, safePath);
		expect(resolved).toBe(path.resolve(workspaceDir, safePath));
	});

	it("should resolve safe absolute paths within the workspace", () => {
		const safePath = path.resolve(workspaceDir, "src/utils/logger.ts");
		const resolved = resolveSecurePath(workspaceDir, safePath);
		expect(resolved).toBe(safePath);
	});

	it("should reject relative paths that traverse outside the workspace", () => {
		const unsafePath = "../package.json";
		expect(() => resolveSecurePath(workspaceDir, unsafePath)).toThrow(
			PathTraversalError,
		);
		expect(() => resolveSecurePath(workspaceDir, unsafePath)).toThrow(
			/Security Violation: Path traversal detected/,
		);
	});

	it("should reject absolute paths that escape the workspace", () => {
		const unsafePath = path.resolve(workspaceDir, "..", "secrets.txt");
		expect(() => resolveSecurePath(workspaceDir, unsafePath)).toThrow(
			PathTraversalError,
		);
	});
});
