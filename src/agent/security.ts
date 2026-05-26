import path from "node:path";

export class PathTraversalError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PathTraversalError";
	}
}

/**
 * Resolves a target path relative to a workspace directory and ensures it remains
 * strictly within the workspace boundaries.
 *
 * If a traversal attempt is detected, throws a PathTraversalError instead of crashing.
 *
 * @param workspaceDir The absolute path of the safe workspace directory
 * @param targetPath The relative or absolute path of the target file/folder
 * @returns The resolved absolute path strictly within the workspace
 */
export function resolveSecurePath(
	workspaceDir: string,
	targetPath: string,
): string {
	const absoluteWorkspace = path.resolve(workspaceDir);
	const resolvedPath = path.resolve(absoluteWorkspace, targetPath);

	// Ensure the resolved path strictly starts with the workspace path
	if (!resolvedPath.startsWith(absoluteWorkspace)) {
		throw new PathTraversalError(
			`Security Violation: Path traversal detected. Access to "${targetPath}" is denied because it falls outside the workspace directory "${absoluteWorkspace}".`,
		);
	}

	return resolvedPath;
}

export class ExecuteSecurityError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ExecuteSecurityError";
	}
}

export const ALLOWED_BINARIES = new Set<string>([]);

/**
 * Validates a command string before shell execution.
 * Splitting command chains and validating each segment's binary against a strict whitelist.
 * Enforces path boundaries by rejecting path traversal (e.g. "..").
 *
 * @param command The full command line string to validate
 * @throws ExecuteSecurityError if a safety violation is detected
 */
export function validateExecuteCommand(command: string): void {
	if (!command || command.trim().length === 0) {
		throw new ExecuteSecurityError(
			"Security Violation: Command cannot be empty.",
		);
	}

	// 1. Strict traversal check
	if (/\.\./.test(command)) {
		throw new ExecuteSecurityError(
			"Security Violation: Path traversal sequence '..' is strictly forbidden in execute commands.",
		);
	}

	// 2. Tokenize by shell operators: &&, ||, ;, |
	const segments = command.split(/&&|\|\||;|\|/);

	for (const segment of segments) {
		const trimmed = segment.trim();
		if (trimmed.length === 0) continue;

		// Split segment into whitespace-separated arguments
		const words = trimmed.split(/\s+/);
		let binary = "";

		// Extract the actual binary, skipping any leading env variable declarations (e.g. NODE_ENV=test)
		for (const word of words) {
			if (word.includes("=") && /^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) {
				continue;
			}
			binary = word;
			break;
		}

		if (!binary) {
			throw new ExecuteSecurityError(
				`Security Violation: Could not resolve a valid binary in segment "${trimmed}".`,
			);
		}

		// Normalize binary name (e.g. strip paths if present - though absolute paths to binaries are blocked by whitelist)
		const binaryName = path.basename(binary);

		if (!ALLOWED_BINARIES.has(binaryName)) {
			throw new ExecuteSecurityError(
				`Security Violation: Command binary "${binaryName}" is not in the whitelist. Allowed binaries are: ${Array.from(
					ALLOWED_BINARIES,
				).join(", ")}.`,
			);
		}
	}
}
