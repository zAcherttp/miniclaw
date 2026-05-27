import pino, { type LoggerOptions } from "pino";

const isTest =
	process.env.NODE_ENV === "test" ||
	process.env.VITEST === "true" ||
	process.env.VITEST === "1";

const options: LoggerOptions = isTest
	? { level: "silent" }
	: {
			transport: {
				target: "pino-pretty",
				options: {
					colorize: true,
				},
			},
		};

export const logger = pino(options);
