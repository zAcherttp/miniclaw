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
