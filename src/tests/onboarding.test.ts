import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Spy on os.homedir before importing other modules
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-onboarding-"));
vi.spyOn(os, "homedir").mockReturnValue(tempHome);

import { runOnboarding } from "@/cli/commands";
import { getAppDir, getConfigPath, getEnvPath } from "@/config/paths";

describe("CLI Onboarding Flow", () => {
	beforeEach(() => {
		// Clean up temp directory before each test
		if (fs.existsSync(tempHome)) {
			fs.rmSync(tempHome, { recursive: true, force: true });
		}
	});

	afterEach(() => {
		// Clean up temp directory after each test
		if (fs.existsSync(tempHome)) {
			fs.rmSync(tempHome, { recursive: true, force: true });
		}
		vi.clearAllMocks();
	});

	it("should initialize default config and env files in the app directory", () => {
		// Verify no config or env exists initially
		const appDir = getAppDir();
		expect(appDir).toContain(tempHome);
		const configPath = getConfigPath();
		const envPath = getEnvPath();

		expect(fs.existsSync(configPath)).toBe(false);
		expect(fs.existsSync(envPath)).toBe(false);

		// Run onboarding
		const config = runOnboarding();

		// Verify returned config is correct
		expect(config).toBeDefined();
		expect(config.agent).toBeDefined();
		expect(config.channels).toBeDefined();
		expect(config.channels.telegram.enabled).toBe(false);

		// Verify files are written to disk
		expect(fs.existsSync(configPath)).toBe(true);
		expect(fs.existsSync(envPath)).toBe(true);

		// Check config file content
		const configJson = JSON.parse(fs.readFileSync(configPath, "utf-8"));
		expect(configJson.agent.model).toBe("ollama:gemma4:31b-cloud");

		// Check env file content
		const envContent = fs.readFileSync(envPath, "utf-8");
		expect(envContent).toContain("TELEGRAM_BOT_TOKEN");
	});
});
