import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import chalk from "chalk";
import { Command } from "commander";
import * as dotenv from "dotenv";
import type z from "zod";
import { AgentLoop } from "@/agent/loop";
import { SkillsManager } from "@/agent/skills";
import { MessageBus } from "@/bus/queue";
import { ChannelManager } from "@/channels/manager";
import { loadConfig, saveConfig } from "@/config/loader";
import { getConfigPath, getEnvPath, getWorkspaceDir } from "@/config/paths";
import { AppConfigSchema } from "@/config/schema";
import { DEFAULT_ENV_TEMPLATE } from "@/template/env";

const isTestEnv =
	process.env.NODE_ENV === "test" ||
	process.env.VITEST === "true" ||
	process.env.VITEST === "1";

function print(...args: unknown[]) {
	if (isTestEnv) return;
	console.log(...args);
}

function askQuestion(query: string): Promise<string> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	return new Promise((resolve) => {
		rl.question(query, (answer) => {
			rl.close();
			resolve(answer);
		});
	});
}

const program = new Command();
program.name("miniclaw").description("Miniclaw - Personal AI Assistant");

export function runOnboarding() {
	print(chalk.bold.cyan("Initializing Miniclaw with default configuration..."));
	const config = AppConfigSchema.parse({});
	saveConfig(config);

	const envPath = getEnvPath();
	if (!fs.existsSync(envPath)) {
		fs.writeFileSync(envPath, DEFAULT_ENV_TEMPLATE, "utf-8");
	}

	print(chalk.green(`Configuration saved to ${getConfigPath()}`));
	print(chalk.green(`Environment variables created at ${envPath}`));

	// Clone template skills during onboarding setup
	const wsDir = getWorkspaceDir(config.workspace_dir);
	void SkillsManager.cloneTemplateSkills(wsDir);

	print("You're all set! Try running miniclaw start to begin.");
	return config;
}

program
	.command("init")
	.description("Initialize Miniclaw configuration")
	.action(async () => {
		const cfgPath = getConfigPath();
		const envPath = getEnvPath();
		let shouldWriteConfig = true;
		let shouldWriteEnv = true;
		let config = AppConfigSchema.parse({});

		if (fs.existsSync(cfgPath)) {
			const answer = await askQuestion(
				chalk.yellow(
					`Configuration already exists at ${cfgPath}.\nDo you want to override the config? (y/N): `,
				),
			);
			if (answer.toLowerCase().trim() !== "y") {
				shouldWriteConfig = false;
				print(chalk.cyan("Skipped overwriting config.json."));
			}
		}

		if (fs.existsSync(envPath)) {
			const answer = await askQuestion(
				chalk.yellow(
					`Environment file already exists at ${envPath}.\nDo you want to overwrite the .env? (y/N): `,
				),
			);
			if (answer.toLowerCase().trim() !== "y") {
				shouldWriteEnv = false;
				print(chalk.cyan("Skipped overwriting .env."));
			}
		}

		if (shouldWriteConfig) {
			print(
				chalk.bold.cyan("Initializing Miniclaw with default configuration..."),
			);
			saveConfig(config);
			print(chalk.green(`Configuration saved to ${cfgPath}`));
		} else {
			try {
				config = loadConfig(cfgPath);
			} catch {}
		}

		if (shouldWriteEnv) {
			const dir = path.dirname(envPath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			fs.writeFileSync(envPath, DEFAULT_ENV_TEMPLATE, "utf-8");
			print(chalk.green(`Environment variables created at ${envPath}`));
		}

		if (shouldWriteConfig || shouldWriteEnv) {
			// Clone template skills during init
			const wsDir = getWorkspaceDir(config.workspace_dir);
			await SkillsManager.cloneTemplateSkills(wsDir);
			print("You're all set! Try running miniclaw start to begin.");
		} else {
			print("No changes made.");
		}
	});

program
	.command("start")
	.description("Start the Miniclaw assistant")
	.action(async () => {
		const cfgPath = getConfigPath();
		let config: z.infer<typeof AppConfigSchema>;
		if (!fs.existsSync(cfgPath)) {
			print(chalk.yellow("Config not found. Initializing defaults..."));
			config = runOnboarding();
		} else {
			config = loadConfig(cfgPath);
		}

		const envPath = getEnvPath();
		if (fs.existsSync(envPath))
			dotenv.config({
				path: envPath,
			});

		print(chalk.green(`Starting Miniclaw with model ${config.agent.model}...`));

		const bus = new MessageBus();
		const agentLoop = new AgentLoop(config, bus);
		const channelManager = new ChannelManager(config, bus, agentLoop);

		await agentLoop.start();
		await channelManager.startAll();

		if (channelManager.enabledChannels.length > 0) {
			print(
				chalk.green(
					`Enabled channels: ${channelManager.enabledChannels.join(", ")}`,
				),
			);
		} else {
			print(
				chalk.yellow(
					"No channels enabled. Configure channels in config.json to receive messages.",
				),
			);
		}

		// Graceful shutdown handling
		let shuttingDown = false;
		let resolveShutdown: (() => void) | undefined;
		const shutdownPromise = new Promise<void>((resolve) => {
			resolveShutdown = resolve;
		});

		const shutdown = async (signal?: NodeJS.Signals) => {
			if (shuttingDown) return;
			shuttingDown = true;
			if (signal) {
				print(chalk.yellow(`\nReceived ${signal}. Shutting down...`));
			}
			await Promise.all([agentLoop.stop(), channelManager.stopAll()]);
			resolveShutdown?.();
		};

		process.once("SIGINT", () => {
			void shutdown("SIGINT");
		});
		process.once("SIGTERM", () => {
			void shutdown("SIGTERM");
		});

		await shutdownPromise;
	});

program
	.command("config")
	.description("Show the current configuration")
	.action(() => {
		const config = loadConfig();
		print(JSON.stringify(config, null, 2));
	});

if (!process.env.VITEST) {
	// Setup no-args equivalent to help
	if (!process.argv.slice(2).length) {
		program.outputHelp();
		process.exit(0);
	}

	program.parse(process.argv);
}
