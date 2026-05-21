import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
	type AIMessageChunk,
	SystemMessage,
	ToolMessage,
} from "@langchain/core/messages";
import type { StructuredTool } from "@langchain/core/tools";
import type { MessageBus } from "@/bus/queue";
import { logger } from "@/utils/logger";
import { ContextEngineeringManager } from "./history";
import {
	DEFAULT_SYSTEM_PROMPT,
	extractThink,
	IncrementalThinkExtractor,
	stripThink,
} from "./loop";
import type { AgentStateType } from "./state";

/**
 * memoryNode updates the graph state by prepending the system prompt with global memory contents injected dynamically.
 */
export async function memoryNode(state: AgentStateType) {
	const memoryContext = await ContextEngineeringManager.loadMemoryFiles(
		state.workspaceDir,
	);
	const systemPrompt =
		DEFAULT_SYSTEM_PROMPT + (memoryContext ? `\n${memoryContext}` : "");

	// Filter out any previous SystemMessages to avoid duplication
	const filteredMessages = state.messages.filter(
		(m) => !(m instanceof SystemMessage),
	);

	return {
		messages: [new SystemMessage(systemPrompt), ...filteredMessages],
	};
}

/**
 * createAgentNode returns a node function that executes the chat model with tools bound and streams output.
 */
export function createAgentNode(
	model: BaseChatModel,
	tools: StructuredTool[],
	bus: MessageBus,
	channel: string,
	chatId: string,
	replyTo: string | undefined,
	streamId: string,
	controller: AbortController,
) {
	// biome-ignore lint/suspicious/noExplicitAny: BaseChatModel type doesn't expose bindTools, but all concrete providers implement it at runtime
	const modelWithTools = (model as any).bindTools(tools);

	return async (state: AgentStateType) => {
		let stream: AsyncIterable<AIMessageChunk>;
		let accumulatedMessage: AIMessageChunk | null = null;
		let streamBuf = "";
		let hasReasoned = false;
		let reasoningClosed = false;
		let prevClean = "";
		const thinkExtractor = new IncrementalThinkExtractor();

		try {
			stream = await modelWithTools.stream(state.messages, {
				signal: controller.signal,
			});

			for await (const chunk of stream) {
				if (controller.signal.aborted) {
					break;
				}

				if (accumulatedMessage === null) {
					accumulatedMessage = chunk;
				} else {
					accumulatedMessage = accumulatedMessage.concat(chunk);
				}

				// 1. Dedicated reasoning content (if supported by the provider)
				const rDelta = chunk.additional_kwargs?.reasoning_content as
					| string
					| undefined;
				if (rDelta) {
					hasReasoned = true;
					await bus.publishOutbound({
						channel,
						chat_id: chatId,
						content: rDelta,
						reply_to: replyTo,
						metadata: {
							_stream_id: streamId,
							_reasoning_delta: true,
							reply_to: replyTo,
						},
					});
				}

				// 2. Inline think tags in content
				const chunkText =
					typeof chunk.content === "string" ? chunk.content : "";
				if (chunkText) {
					streamBuf += chunkText;

					// Check for incremental thinking
					const [thinkingText] = extractThink(streamBuf);
					if (thinkingText) {
						hasReasoned = true;
						const newThink = thinkingText.substring(
							thinkExtractor.emitted.length,
						);
						if (newThink) {
							thinkExtractor.emitted = thinkingText;
							await bus.publishOutbound({
								channel,
								chat_id: chatId,
								content: newThink,
								reply_to: replyTo,
								metadata: {
									_stream_id: streamId,
									_reasoning_delta: true,
									reply_to: replyTo,
								},
							});
						}
					}

					// Check for incremental clean content
					const newClean = stripThink(streamBuf);
					const incremental = newClean.substring(prevClean.length);
					if (incremental) {
						if (hasReasoned && !reasoningClosed) {
							await bus.publishOutbound({
								channel,
								chat_id: chatId,
								content: "",
								reply_to: replyTo,
								metadata: {
									_stream_id: streamId,
									_reasoning_end: true,
									reply_to: replyTo,
								},
							});
							reasoningClosed = true;
						}
						prevClean = newClean;
						await bus.publishOutbound({
							channel,
							chat_id: chatId,
							content: incremental,
							reply_to: replyTo,
							metadata: {
								_stream_id: streamId,
								_stream_delta: true,
								reply_to: replyTo,
							},
						});
					}
				}
			}

			if (hasReasoned && !reasoningClosed) {
				await bus.publishOutbound({
					channel,
					chat_id: chatId,
					content: "",
					reply_to: replyTo,
					metadata: {
						_stream_id: streamId,
						_reasoning_end: true,
						reply_to: replyTo,
					},
				});
				reasoningClosed = true;
			}
		} catch (e) {
			if (controller.signal.aborted) {
				// safely ignore
			} else {
				logger.error(
					e,
					"[nodes] Failed to stream chat model, falling back to invoke",
				);
				const response = await modelWithTools.invoke(state.messages, {
					signal: controller.signal,
				});
				return {
					messages: [response],
				};
			}
		}

		if (accumulatedMessage) {
			return {
				messages: [accumulatedMessage],
			};
		}

		return {
			messages: [],
		};
	};
}

/**
 * createToolsNode returns a node function that executes the tools sequentially and publishes status hints.
 */
export function createToolsNode(
	tools: StructuredTool[],
	bus: MessageBus,
	channel: string,
	chatId: string,
	streamId: string,
	controller: AbortController,
) {
	const toolsByName = new Map<string, StructuredTool>(
		tools.map((t) => [t.name, t]),
	);

	return async (state: AgentStateType) => {
		const lastMessage = state.messages[state.messages.length - 1];
		if (
			!lastMessage ||
			!("tool_calls" in lastMessage) ||
			!Array.isArray(lastMessage.tool_calls) ||
			lastMessage.tool_calls.length === 0
		) {
			return { messages: [] };
		}

		const toolCalls = lastMessage.tool_calls;
		const hintText = `⚙️ Calling ${toolCalls.map((tc) => tc.name).join(", ")}`;

		await bus.publishOutbound({
			channel,
			chat_id: chatId,
			content: hintText,
			metadata: {
				_stream_id: `tools-${streamId}`,
				_stream_delta: true,
				_overwrite: true,
			},
		});

		const newToolMessages: ToolMessage[] = [];

		for (const tc of toolCalls) {
			if (controller.signal.aborted) {
				break;
			}
			const tool = toolsByName.get(tc.name);
			let result: string;
			const argsStr = JSON.stringify(tc.args);
			const truncatedArgs =
				argsStr.length > 150 ? `${argsStr.substring(0, 147)}...` : argsStr;
			logger.info(
				`[AgentLoop] Calling tool: ${tc.name} with args: ${truncatedArgs}`,
			);

			if (!tool) {
				result = `Error: Tool ${tc.name} is not available.`;
				logger.error(`[AgentLoop] Tool ${tc.name} is not available.`);
			} else {
				try {
					result = await tool.invoke(tc.args);
					const truncatedResult =
						result.length > 200 ? `${result.substring(0, 197)}...` : result;
					logger.info(
						`[AgentLoop] Tool ${tc.name} returned: ${truncatedResult}`,
					);
				} catch (err) {
					const errorMsg = err instanceof Error ? err.message : String(err);
					result = `Error executing tool ${tc.name}: ${errorMsg}`;
					logger.error(
						err,
						`[AgentLoop] Tool ${tc.name} failed with error: ${errorMsg}`,
					);
				}
			}

			newToolMessages.push(
				new ToolMessage({
					content: result,
					tool_call_id: tc.id ?? "",
					name: tc.name,
				}),
			);
		}

		return {
			messages: newToolMessages,
		};
	};
}

/**
 * Router to determine whether execution should continue or end.
 */
export function shouldContinue(state: AgentStateType) {
	const lastMessage = state.messages[state.messages.length - 1];
	if (
		lastMessage &&
		"tool_calls" in lastMessage &&
		Array.isArray(lastMessage.tool_calls) &&
		lastMessage.tool_calls.length > 0
	) {
		return "tools";
	}
	return "__end__";
}
