import type { InboundMessage, OutboundMessage } from "./message";

class AsyncQueue<T> {
	private queue: T[] = [];
	private resolvers: ((value: T) => void)[] = [];

	push(item: T) {
		if (this.resolvers.length > 0) {
			const resolve = this.resolvers.shift();
			resolve?.(item);
		} else {
			this.queue.push(item);
		}
	}

	unshift(item: T) {
		if (this.resolvers.length > 0) {
			const resolve = this.resolvers.shift();
			resolve?.(item);
		} else {
			this.queue.unshift(item);
		}
	}

	tryPop(): T | undefined {
		return this.queue.shift();
	}

	async pop(): Promise<T> {
		if (this.queue.length > 0) {
			return this.queue.shift() as T;
		}
		return new Promise((resolve) => this.resolvers.push(resolve));
	}

	async popWithTimeout(timeoutMs: number): Promise<T | undefined> {
		if (timeoutMs <= 0) {
			return this.tryPop();
		}
		if (this.queue.length > 0) {
			return this.queue.shift();
		}

		return new Promise((resolve) => {
			let settled = false;
			const resolver = (value: T) => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(timeout);
				resolve(value);
			};

			this.resolvers.push(resolver);

			const timeout = setTimeout(() => {
				if (settled) {
					return;
				}
				settled = true;
				const index = this.resolvers.indexOf(resolver);
				if (index >= 0) {
					this.resolvers.splice(index, 1);
				}
				resolve(undefined);
			}, timeoutMs);
		});
	}
}

export interface InboundBatchOptions {
	maxCombinedContentLength?: number;
	debounceMs?: number;
}

export class MessageBus {
	private inbound = new AsyncQueue<InboundMessage>();
	private outbound = new AsyncQueue<OutboundMessage>();

	async publishInbound(msg: InboundMessage): Promise<void> {
		this.inbound.push(msg);
	}

	async consumeInbound(): Promise<InboundMessage> {
		return this.inbound.pop();
	}

	async consumeInboundBatch(
		options: InboundBatchOptions = {},
	): Promise<InboundMessage[]> {
		const maxCombinedContentLength = Math.max(
			options.maxCombinedContentLength ?? 1200,
			1,
		);
		const debounceMs = Math.max(options.debounceMs ?? 250, 0);

		const first = await this.inbound.pop();
		if (first.metadata?._shutdown === true || debounceMs === 0) {
			return [first];
		}

		const batch: InboundMessage[] = [first];
		let combinedContentLength = first.content.length;
		const batchKey = this.batchKeyForInbound(first);
		let waitMs = debounceMs;

		while (true) {
			const next = await this.inbound.popWithTimeout(waitMs);
			if (!next) {
				break;
			}
			if (next.metadata?._shutdown === true) {
				this.inbound.unshift(next);
				break;
			}
			if (this.batchKeyForInbound(next) !== batchKey) {
				this.inbound.unshift(next);
				break;
			}
			const nextLength = next.content.length;
			if (
				batch.length > 0 &&
				combinedContentLength + nextLength > maxCombinedContentLength
			) {
				this.inbound.unshift(next);
				break;
			}

			batch.push(next);
			combinedContentLength += nextLength;
			waitMs = debounceMs;
		}

		return batch;
	}

	async publishOutbound(msg: OutboundMessage): Promise<void> {
		this.outbound.push(msg);
	}

	async consumeOutbound(): Promise<OutboundMessage> {
		return this.outbound.pop();
	}

	tryConsumeOutbound(): OutboundMessage | undefined {
		return this.outbound.tryPop();
	}

	private batchKeyForInbound(msg: InboundMessage): string {
		return `${msg.channel}:${msg.chat_id}:${msg.sender_id}`;
	}
}
