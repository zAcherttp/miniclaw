import { z } from "zod";

export const AgentConfigSchema = z.object({
	model: z.string().default("ollama:gemma4:31b-cloud"),
	system_prompt: z.string().optional(),
	max_iterations: z.number().default(15),
	temperature: z.number().default(0.7),
});

export const AppConfigSchema = z.object({
	agent: AgentConfigSchema.default({
		model: "ollama:gemma4:31b-cloud",
		max_iterations: 15,
		temperature: 0.7,
	}),
	workspace_dir: z.string().default("~/.miniclaw/workspace"),
	log_level: z.string().default("INFO"),
	environment: z.record(z.string(), z.string()).default({}),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
