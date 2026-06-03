import { z } from "zod";

export const AgentConfigSchema = z.object({
	model: z.string().default("ollama:gemma4:31b-cloud"),
	summarization_model: z.string().optional(),
	system_prompt: z.string().optional(),
	max_iterations: z.number().default(30),
	temperature: z.number().default(0.7),
	reasoning_effort: z.string().default("medium"),
	compaction_trigger_tokens: z.number().default(220000),
	skills_dirs: z.array(z.string()).default(["skills"]),
});

const AllowFromSchema = z
	.union([z.string(), z.array(z.string())])
	.transform((value) => (typeof value === "string" ? [value] : value));

export const ChannelCommonConfigSchema = z.object({
	streaming: z.boolean().default(true),
	allowFrom: AllowFromSchema.default([""]),
	allow_from: AllowFromSchema.optional(),
});

export const TelegramChannelConfigSchema = ChannelCommonConfigSchema.extend({
	enabled: z.boolean().default(false),
	token: z.string().optional(),
});

export const ChannelsConfigSchema = z.object({
	telegram: TelegramChannelConfigSchema.default({
		enabled: false,
		streaming: true,
		allowFrom: [""],
	}),
});

export const AppConfigSchema = z.object({
	agent: AgentConfigSchema.default({
		model: "ollama:gemma4:31b-cloud",
		max_iterations: 30,
		temperature: 0.7,
		reasoning_effort: "medium",
		compaction_trigger_tokens: 220000,
		skills_dirs: ["skills"],
	}),
	channels: ChannelsConfigSchema.default({
		telegram: {
			enabled: false,
			streaming: true,
			allowFrom: [""],
		},
	}),
	workspace_dir: z.string().default("~/.miniclaw/workspace"),
	log_level: z.string().default("INFO"),
	environment: z.record(z.string(), z.string()).default({}),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type ChannelsConfig = z.infer<typeof ChannelsConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
