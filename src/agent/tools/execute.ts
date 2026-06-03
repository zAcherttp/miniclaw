import cp from "node:child_process";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { ExecuteSecurityError, validateExecuteCommand } from "../security";

/**
 * ============================================================================
 * SECURE EXECUTE TOOL DOCUMENTATION
 * ============================================================================
 * This tool executes whitelisted shell commands securely inside the active workspace.
 *
 * Architecture and Runtime Guards:
 *
 * ```mermaid
 * graph TD
 *     subgraph Input_Processing["1. Input Parsing & Command Validation"]
 *         A["Agent issues execute(command)"] --> B["Command Tokenizer<br/>(Split segments by &&, ||, ;, |)"]
 *         B --> C["Verify Binaries against Whitelist<br/>(None whitelisted by default)"]
 *         C -->|Failed| D["Abort: Security Violation Error"]
 *         C -->|Passed| E["Path Traversal Inspection<br/>(Block '..', check target bounds)"]
 *         E -->|Failed| D
 *         E -->|Passed| F["Secure Command Confirmed"]
 *     end
 *
 *     subgraph Process_Execution["2. Sandboxed Process Execution"]
 *         F --> G["Spawn Process via child_process.spawn()"]
 *         G -->|Set CWD| H["CWD = active workspaceDir<br/>(Loaded dynamically via LangGraph config)"]
 *         G -->|Enforce Timeout| I["30-second Timer Guard"]
 *         I -->|Exceeded| J["Force Terminate (SIGTERM/SIGKILL)<br/>Return Timeout Error"]
 *     end
 *
 *     subgraph Output_Sanitization["3. Output Handling & Truncation"]
 *         G -->|Read Stdout / Stderr| K["Combine Streams & Enforce 30KB Buffer Cap"]
 *         K -->|Cap Exceeded| L["Truncate Output & Append Notice"]
 *         K -->|Completed| M["Format with Exit Code & Return to Agent"]
 *         M --> N["Return Success/Failure to Loop"]
 *     end
 * ```
 * ============================================================================
 */

export const EXECUTE_TOOL_DESCRIPTION = `Executes a shell command in the workspace directory with strict safety measures.

Supported Whitelisted Binaries: gws, lark-cli.

Usage notes:
- Running directory is strictly locked to your active workspace root.
- Shell chaining (&&, ||, ;, |) is supported but every single segment will be validated against the whitelist.
- Paths containing spaces must be quoted.
- Directory traversal (e.g. "..") is strictly forbidden in arguments.
- Forces a strict 30-second timeout. Any execution exceeding 30s will be terminated.
- Standard error (stderr) lines are prefixed with '[stderr] ' for clear distinction.
- Output is capped at 30,000 characters and truncated if exceeded.`;

/**
 * Creates the dynamic secure execute tool.
 *
 * @param workspaceDir The absolute path to the active workspace directory
 * @param options Optional options such as timeoutMs (defaults to 30000)
 * @returns A DynamicStructuredTool instance for secure command execution
 */
export function createExecuteTool(
	workspaceDir: string,
	options: { timeoutMs?: number } = {},
): DynamicStructuredTool {
	const timeoutMs = options.timeoutMs ?? 30000;
	const timeoutSecStr = (timeoutMs / 1000).toFixed(1);

	return new DynamicStructuredTool({
		name: "execute",
		description: EXECUTE_TOOL_DESCRIPTION,
		schema: z.object({
			command: z
				.string()
				.describe(
					"The shell command to execute (subject to strict whitelist validation; allowed: gws, lark-cli)",
				),
		}),
		func: async ({ command }) => {
			try {
				// 1. Perform static security validations (whitelist check and traversal inspection)
				validateExecuteCommand(command);
			} catch (err: unknown) {
				if (err instanceof ExecuteSecurityError) {
					return err.message;
				}
				return `Security Error validating command: ${(err as Error).message}`;
			}

			// 2. Spawn and monitor the process safely
			return new Promise<string>((resolve) => {
				let stdout = "";
				let stderr = "";
				let timedOut = false;

				const child = cp.spawn(command, {
					shell: true,
					cwd: workspaceDir,
					env: {
						PATH: process.env.PATH,
						NODE_ENV: process.env.NODE_ENV || "development",
						HOME: process.env.HOME,
						USERPROFILE: process.env.USERPROFILE,
						APPDATA: process.env.APPDATA,
						LOCALAPPDATA: process.env.LOCALAPPDATA,
						PNPM_HOME: process.env.PNPM_HOME,
					},
				});

				// Set the strict execution timeout guard
				const timer = setTimeout(() => {
					timedOut = true;
					try {
						child.kill("SIGKILL");
					} catch {}
					resolve(
						`Error: Command timed out after ${timeoutSecStr} seconds. Process was terminated.`,
					);
				}, timeoutMs);

				child.stdout?.on("data", (chunk) => {
					stdout += chunk.toString();
				});

				child.stderr?.on("data", (chunk) => {
					stderr += chunk.toString();
				});

				child.on("error", (err) => {
					clearTimeout(timer);
					resolve(`Error executing process: ${err.message}`);
				});

				child.on("close", (code, signal) => {
					clearTimeout(timer);

					if (timedOut) {
						return;
					}

					if (signal === "SIGKILL" || signal === "SIGTERM") {
						resolve(
							`Error: Command timed out after ${timeoutSecStr} seconds. Process was terminated.`,
						);
						return;
					}

					// 3. Assemble and sanitize stdout / stderr output
					const outputParts: string[] = [];
					if (stdout) {
						outputParts.push(stdout);
					}
					if (stderr) {
						const stderrLines = stderr.trim().split(/\r?\n/);
						outputParts.push(...stderrLines.map((line) => `[stderr] ${line}`));
					}

					let combinedOutput =
						outputParts.length > 0 ? outputParts.join("\n") : "<no output>";

					// Enforce the 30KB output buffer cap limit
					let truncated = false;
					if (combinedOutput.length > 30000) {
						combinedOutput =
							combinedOutput.substring(0, 30000) +
							"\n\n... Output truncated at 30000 bytes.";
						truncated = true;
					}

					const exitCode = code ?? 1;
					const status = exitCode === 0 ? "succeeded" : "failed";
					let finalReport = combinedOutput;

					finalReport += `\n[Command ${status} with exit code ${exitCode}]`;
					if (truncated) {
						finalReport += "\n[Output was truncated due to size limits]";
					}

					resolve(finalReport);
				});
			});
		},
	});
}
