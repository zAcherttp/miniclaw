import fs from "node:fs";
import { getConfigPath } from "./paths";
import { type AppConfig, AppConfigSchema } from "./schema";

export function loadConfig(customPath?: string): AppConfig {
	const cfgPath = customPath || getConfigPath();
	if (!fs.existsSync(cfgPath)) {
		return AppConfigSchema.parse({});
	}
	try {
		const raw = fs.readFileSync(cfgPath, "utf-8");
		return AppConfigSchema.parse(JSON.parse(raw));
	} catch (e) {
		console.warn(`Failed to load config: ${(e as Error).message}`);
		return AppConfigSchema.parse({});
	}
}

export function saveConfig(config: AppConfig, customPath?: string): void {
	const cfgPath = customPath || getConfigPath();
	fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), "utf-8");
}
