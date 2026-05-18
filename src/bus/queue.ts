import { InboundMessage, OutboundMessage } from './message';

class AsyncQueue<T> {
  private queue: T[] = [];
  private resolvers: ((value: T) => void)[] = [];

  push(item: T) {
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift();
      resolve!(item);
    } else {
      this.queue.push(item);
    }
  }

  async pop(): Promise<T> {
    if (this.queue.length > 0) {
      return this.queue.shift() as T;
    }
    return new Promise(resolve => this.resolvers.push(resolve));
  }
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

  async publishOutbound(msg: OutboundMessage): Promise<void> {
    this.outbound.push(msg);
  }

  async consumeOutbound(): Promise<OutboundMessage> {
    return this.outbound.pop();
  }
}
