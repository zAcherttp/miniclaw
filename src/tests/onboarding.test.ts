import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Spy on os.homedir before importing other modules
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-onboarding-"));
vi.spyOn(os, "homedir").mockReturnValue(tempHome);

import { runOnboarding } from "@/cli/commands";
import {
	getAppDir,
	getConfigPath,
	getEnvPath,
	getWorkspaceDir,
} from "@/config/paths";
import { type AppConfig, AppConfigSchema } from "@/config/schema";

describe("CLI Onboarding Flow", () => {
	beforeEach(() => {
		vi.spyOn(os, "homedir").mockReturnValue(tempHome);
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
		expect(configJson.agent.skills_dirs).toEqual(["skills", "workflows"]);

		// Verify default directories are created
		const wsDir = getWorkspaceDir(config.workspace_dir);
		expect(fs.existsSync(path.join(wsDir, "skills"))).toBe(true);
		expect(fs.existsSync(path.join(wsDir, "workflows"))).toBe(true);
		expect(fs.existsSync(path.join(wsDir, "AGENTS.md"))).toBe(true);

		// Check env file content
		const envContent = fs.readFileSync(envPath, "utf-8");
		expect(envContent).toContain("TELEGRAM_BOT_TOKEN");
	});

	it("should create custom skill directories (absolute and relative) during onboarding setup", () => {
		// Mock config with custom skill dirs
		const mockConfig: AppConfig = {
			agent: {
				model: "ollama:gemma4:31b-cloud",
				max_iterations: 30,
				temperature: 0.7,
				reasoning_effort: "medium",
				compaction_trigger_tokens: 50000,
				skills_dirs: [
					"skills",
					"workflows",
					"custom-rel-dir",
					path.join(tempHome, "custom-abs-dir"),
				],
			},
			channels: {
				telegram: { enabled: false, streaming: true, allowFrom: [""] },
			},
			workspace_dir: path.join(tempHome, "workspace"),
			log_level: "INFO",
			environment: {},
		};

		// Spy on AppConfigSchema.parse to return our mockConfig
		const parseSpy = vi
			.spyOn(AppConfigSchema, "parse")
			.mockReturnValue(mockConfig);

		try {
			const config = runOnboarding();
			const wsDir = getWorkspaceDir(config.workspace_dir);

			// Verify all directories exist
			expect(fs.existsSync(path.join(wsDir, "skills"))).toBe(true);
			expect(fs.existsSync(path.join(wsDir, "workflows"))).toBe(true);
			expect(fs.existsSync(path.join(wsDir, "custom-rel-dir"))).toBe(true);
			expect(fs.existsSync(path.join(tempHome, "custom-abs-dir"))).toBe(true);
			expect(fs.existsSync(path.join(wsDir, "AGENTS.md"))).toBe(true);
		} finally {
			parseSpy.mockRestore();
		}
	});
});
