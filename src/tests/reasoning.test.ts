import { describe, it, expect } from "vitest";
import { MessageBus } from "@/bus/queue";
import { AgentEventObserver } from "@/agent/observer";
import { AIMessageChunk } from "@langchain/core/messages";

describe("AgentEventObserver Reasoning Streaming", () => {
	it("should parse standard LangChain content blocks with reasoning", async () => {
		const bus = new MessageBus();
		const observer = new AgentEventObserver(bus, "12345", "telegram", "reply-id", "stream-id");

		// Simulate standard LangChain stream yielding blocks
		const stream = (async function* () {
			yield {
				contentBlocks: [
					{ type: "reasoning", reasoning: "Thinking about " },
				],
			};
			yield {
				contentBlocks: [
					{ type: "reasoning", reasoning: "how to answer..." },
				],
			};
			yield {
				contentBlocks: [
					{ type: "text", text: "Here is " },
				],
			};
			yield {
				contentBlocks: [
					{ type: "text", text: "the reply." },
				],
			};
		})();

		await observer.consume(stream);

		// Read outbound queue events
		const outboundEvents: any[] = [];
		let event = bus.tryConsumeOutbound();
		while (event) {
			outboundEvents.push(event);
			event = bus.tryConsumeOutbound();
		}

		// Verify reasoning deltas
		const reasoningDeltas = outboundEvents.filter(e => e.metadata?._reasoning_delta);
		expect(reasoningDeltas).toHaveLength(2);
		expect(reasoningDeltas[0].content).toBe("Thinking about ");
		expect(reasoningDeltas[1].content).toBe("how to answer...");

		// Verify reasoning end event
		const reasoningEnd = outboundEvents.find(e => e.metadata?._reasoning_end);
		expect(reasoningEnd).toBeDefined();

		// Verify stream deltas
		const streamDeltas = outboundEvents.filter(e => e.metadata?._stream_delta);
		expect(streamDeltas).toHaveLength(2);
		expect(streamDeltas[0].content).toBe("Here is ");
		expect(streamDeltas[1].content).toBe("the reply.");

		// Verify stream end event
		const streamEnd = outboundEvents.find(e => e.metadata?._stream_end);
		expect(streamEnd).toBeDefined();
	});

	it("should parse array-based chunk.content blocks (LangChain core format)", async () => {
		const bus = new MessageBus();
		const observer = new AgentEventObserver(bus, "12345", "telegram", "reply-id", "stream-id");

		// Simulate chunk.content being an array of blocks
		const stream = (async function* () {
			yield {
				content: [
					{ type: "reasoning", reasoning: "Let me check the database. " },
				],
			};
			yield {
				content: [
					{ type: "text", text: "Database results: " },
				],
			};
		})();

		await observer.consume(stream);

		const outboundEvents: any[] = [];
		let event = bus.tryConsumeOutbound();
		while (event) {
			outboundEvents.push(event);
			event = bus.tryConsumeOutbound();
		}

		const reasoningDeltas = outboundEvents.filter(e => e.metadata?._reasoning_delta);
		expect(reasoningDeltas).toHaveLength(1);
		expect(reasoningDeltas[0].content).toBe("Let me check the database. ");

		const reasoningEnd = outboundEvents.find(e => e.metadata?._reasoning_end);
		expect(reasoningEnd).toBeDefined();

		const streamDeltas = outboundEvents.filter(e => e.metadata?._stream_delta);
		expect(streamDeltas).toHaveLength(1);
		expect(streamDeltas[0].content).toBe("Database results: ");
	});

	it("should parse API-based reasoning_content fields (OpenAI / Ollama / DeepSeek format)", async () => {
		const bus = new MessageBus();
		const observer = new AgentEventObserver(bus, "12345", "telegram", "reply-id", "stream-id");

		// Simulate chunks with additional_kwargs.reasoning_content or reasoning_content properties
		const stream = (async function* () {
			yield {
				content: "",
				reasoning_content: "Searching records",
			};
			yield {
				content: "",
				additional_kwargs: {
					reasoning_content: " and compiling list...",
				},
			};
			yield {
				content: "Records found:",
				additional_kwargs: {},
			};
		})();

		await observer.consume(stream);

		const outboundEvents: any[] = [];
		let event = bus.tryConsumeOutbound();
		while (event) {
			outboundEvents.push(event);
			event = bus.tryConsumeOutbound();
		}

		const reasoningDeltas = outboundEvents.filter(e => e.metadata?._reasoning_delta);
		expect(reasoningDeltas).toHaveLength(2);
		expect(reasoningDeltas[0].content).toBe("Searching records");
		expect(reasoningDeltas[1].content).toBe(" and compiling list...");

		const reasoningEnd = outboundEvents.find(e => e.metadata?._reasoning_end);
		expect(reasoningEnd).toBeDefined();

		const streamDeltas = outboundEvents.filter(e => e.metadata?._stream_delta);
		expect(streamDeltas).toHaveLength(1);
		expect(streamDeltas[0].content).toBe("Records found:");
	});

	it("should parse text-based <think>...</think> tags incrementally in real-time (DeepSeek R1 Ollama format)", async () => {
		const bus = new MessageBus();
		const observer = new AgentEventObserver(bus, "12345", "telegram", "reply-id", "stream-id");

		// Simulate streaming raw content that contains <think> tags split across chunks
		const stream = (async function* () {
			yield { content: "Some preamble text. <thi" };
			yield { content: "nk>This is my reasoning " };
			yield { content: "part. </thi" };
			yield { content: "nk>And here is the final answer." };
		})();

		await observer.consume(stream);

		const outboundEvents: any[] = [];
		let event = bus.tryConsumeOutbound();
		while (event) {
			outboundEvents.push(event);
			event = bus.tryConsumeOutbound();
		}

		// Verify text delta before <think>
		const preDeltas = outboundEvents.filter(e => e.metadata?._stream_delta && e.content.includes("preamble"));
		expect(preDeltas).toHaveLength(1);
		expect(preDeltas[0].content).toBe("Some preamble text. ");

		// Verify reasoning deltas
		const reasoningDeltas = outboundEvents.filter(e => e.metadata?._reasoning_delta);
		expect(reasoningDeltas).toHaveLength(2);
		expect(reasoningDeltas[0].content).toBe("This is my reasoning ");
		expect(reasoningDeltas[1].content).toBe("part. ");

		// Verify reasoning end event
		const reasoningEnd = outboundEvents.find(e => e.metadata?._reasoning_end);
		expect(reasoningEnd).toBeDefined();

		// Verify final text delta
		const postDeltas = outboundEvents.filter(e => e.metadata?._stream_delta && e.content.includes("final"));
		expect(postDeltas).toHaveLength(1);
		expect(postDeltas[0].content).toBe("And here is the final answer.");
	});

	it("should prune historical reasoning content exceeding the 10,000 token budget, prioritizing newer ones", async () => {
		const { applyReasoningBudget } = await import("@/agent/tokenizer");
		const { AIMessage, HumanMessage } = await import("@langchain/core/messages");

		// Create a sequence of messages.
		// We'll make some of them contain reasoning text that is large.
		// Heuristic: estimateTokens returns roughly chars / 3.8.
		// Let's create reasoning text of 38,000 characters (~10,000 tokens) for one message.
		const largeReasoning = "x".repeat(38000); // ~10,000 tokens
		const mediumReasoning = "y".repeat(19000); // ~5,000 tokens

		const msg1 = new AIMessage({
			content: "Initial reply",
			additional_kwargs: { reasoning_content: mediumReasoning },
		});
		const msg2 = new HumanMessage("Next user prompt");
		const msg3 = new AIMessage({
			content: "Second reply",
			additional_kwargs: { reasoning_content: mediumReasoning },
		});
		const msg4 = new HumanMessage("Third user prompt");
		const msg5 = new AIMessage({
			content: "Latest reply",
			additional_kwargs: { reasoning_content: mediumReasoning },
		});

		const history = [msg1, msg2, msg3, msg4, msg5];
		const pruned = applyReasoningBudget(history);

		// Walk backwards:
		// msg5 (latest): reasoning is kept (budget remaining: 5,000 tokens)
		// msg3 (second): reasoning is kept (budget remaining: 0 tokens)
		// msg1 (initial): reasoning should be pruned/stripped
		expect(pruned[4].additional_kwargs?.reasoning_content).toBe(mediumReasoning);
		expect(pruned[2].additional_kwargs?.reasoning_content).toBe(mediumReasoning);
		expect(pruned[0].additional_kwargs?.reasoning_content).toBeUndefined();

		// Ensure content (replies themselves) and non-reasoning messages are completely intact
		expect(pruned[0].content).toBe("Initial reply");
		expect(pruned[1].content).toBe("Next user prompt");
		expect(pruned[2].content).toBe("Second reply");
		expect(pruned[3].content).toBe("Third user prompt");
		expect(pruned[4].content).toBe("Latest reply");
	});
});
