import { Command } from 'commander';
import chalk from 'chalk';
import * as dotenv from 'dotenv';
import fs from 'fs';
import { getEnvPath, getConfigPath } from '../config/paths';
import { loadConfig, saveConfig } from '../config/loader';
import { AppConfigSchema } from '../config/schema';
import { MessageBus } from '../bus/queue';
import { AgentLoop } from '../agent/loop';

const program = new Command();
program.name('miniclaw').description('Miniclaw - Personal AI Assistant');

function runOnboarding() {
  console.log(chalk.bold.cyan('Initializing Miniclaw with default configuration...'));
  const config = AppConfigSchema.parse({});
  saveConfig(config);
  
  const envPath = getEnvPath();
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, 'OLLAMA_API_KEY="" # (cloud only; optional)\n', 'utf-8');
  }
  
  console.log(chalk.green('Configuration saved to ' + getConfigPath()));
  console.log(chalk.green('Environment variables created at ' + envPath));
  console.log("You're all set! Try running miniclaw start to begin.");
  return config;
}

program.command('init')
  .description('Initialize Miniclaw configuration')
  .action(() => {
    const cfgPath = getConfigPath();
    if (fs.existsSync(cfgPath)) {
       console.log(chalk.yellow('Configuration already exists at ' + cfgPath + '. Remove it to re-run init.'));
       return;
    }
    runOnboarding();
  });

program.command('start')
  .description('Start the Miniclaw assistant')
  .action(async () => {
    const cfgPath = getConfigPath();
    let config;
    if (!fs.existsSync(cfgPath)) {
      console.log(chalk.yellow('Config not found. Initializing defaults...'));
      config = runOnboarding();
    } else {
      config = loadConfig(cfgPath);
    }

    const envPath = getEnvPath();
    if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

    console.log(chalk.green('Starting Miniclaw with model ' + config.agent.model + '...'));
    
    const bus = new MessageBus();
    const agentLoop = new AgentLoop(config, bus);
    await agentLoop.start();

    // Graceful shutdown handling
    const shutdown = async () => {
      console.log(chalk.yellow('\nHarsh shutdown intercepted (Ctrl+C).'));
      console.log(chalk.yellow('Initiating graceful shutdown anyway...'));
      await agentLoop.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep Node running
    await new Promise(() => {});
  });

program.command('config')
  .description('Show the current configuration')
  .action(() => {
    const config = loadConfig();
    console.log(JSON.stringify(config, null, 2));
  });

// Setup no-args equivalent to help
if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(0);
}

program.parse(process.argv);
