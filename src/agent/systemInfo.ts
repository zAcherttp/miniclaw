import os from "node:os";

export function getSystemInfoBlock(workspaceDir: string): string {
	const now = new Date();
	const formattedDate = now.toLocaleString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		timeZoneName: "short",
	});

	const defaultShell =
		process.platform === "win32"
			? process.env.COMSPEC || "cmd.exe"
			: process.env.SHELL || "/bin/sh";

	return (
		"\n## HOST ENVIRONMENT & SYSTEM CONTEXT\n" +
		`- **Operating System**: ${os.platform()} (${os.type()} ${os.release()})\n` +
		`- **Active Workspace Directory**: ${workspaceDir}\n` +
		`- **Current Local Date & Time**: ${formattedDate}\n` +
		`- **Default Shell**: ${defaultShell}\n`
	);
}
