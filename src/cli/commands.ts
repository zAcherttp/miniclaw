import fs from "node:fs";
import chalk from "chalk";
import { Command } from "commander";
import * as dotenv from "dotenv";
import type z from "zod";
import { AgentLoop } from "@/agent/loop";
import { MessageBus } from "@/bus/queue";
import { ChannelManager } from "@/channels/manager";
import { loadConfig, saveConfig } from "@/config/loader";
import { getConfigPath, getEnvPath } from "@/config/paths";
import { AppConfigSchema } from "@/config/schema";

const program = new Command();
program.name("miniclaw").description("Miniclaw - Personal AI Assistant");

export function runOnboarding() {
	console.log(
		chalk.bold.cyan("Initializing Miniclaw with default configuration..."),
	);
	const config = AppConfigSchema.parse({});
	saveConfig(config);

	const envPath = getEnvPath();
	if (!fs.existsSync(envPath)) {
		fs.writeFileSync(
			envPath,
			'OLLAMA_API_KEY="" # (cloud only; optional)\nTELEGRAM_BOT_TOKEN=""\n',
			"utf-8",
		);
	}

	console.log(chalk.green(`Configuration saved to ${getConfigPath()}`));
	console.log(chalk.green(`Environment variables created at ${envPath}`));
	console.log("You're all set! Try running miniclaw start to begin.");
	return config;
}

program
	.command("init")
	.description("Initialize Miniclaw configuration")
	.action(() => {
		const cfgPath = getConfigPath();
		if (fs.existsSync(cfgPath)) {
			console.log(
				chalk.yellow(
					"Configuration already exists at " +
						cfgPath +
						". Remove it to re-run init.",
				),
			);
			return;
		}
		runOnboarding();
	});

program
	.command("start")
	.description("Start the Miniclaw assistant")
	.action(async () => {
		const cfgPath = getConfigPath();
		let config: z.infer<typeof AppConfigSchema>;
		if (!fs.existsSync(cfgPath)) {
			console.log(chalk.yellow("Config not found. Initializing defaults..."));
			config = runOnboarding();
		} else {
			config = loadConfig(cfgPath);
		}

		const envPath = getEnvPath();
		if (fs.existsSync(envPath))
			dotenv.config({
				path: envPath,
			});

		console.log(
			chalk.green(`Starting Miniclaw with model ${config.agent.model}...`),
		);

		const bus = new MessageBus();
		const agentLoop = new AgentLoop(config, bus);
		const channelManager = new ChannelManager(config, bus);

		await agentLoop.start();
		await channelManager.startAll();

		if (channelManager.enabledChannels.length > 0) {
			console.log(
				chalk.green(
					`Enabled channels: ${channelManager.enabledChannels.join(", ")}`,
				),
			);
		} else {
			console.log(
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
				console.log(chalk.yellow(`\nReceived ${signal}. Shutting down...`));
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
		console.log(JSON.stringify(config, null, 2));
	});

if (!process.env.VITEST) {
	// Setup no-args equivalent to help
	if (!process.argv.slice(2).length) {
		program.outputHelp();
		process.exit(0);
	}

	program.parse(process.argv);
}
