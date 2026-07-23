type Handler<T> = (data: T) => Promise<void>;

// Dead-simple in-process job queue. Good enough for local dev and small
// deployments; swap in BullMQ if you need persistence across restarts.
class LocalQueue<T> {
  private handler?: Handler<T>;
  private waiting: T[] = [];
  private active = 0;

  constructor(private readonly concurrency: number = 1) {}

  register(handler: Handler<T>): void {
    this.handler = handler;
    this.pump();
  }

  async add(_name: string, data: T): Promise<{ id: string }> {
    this.waiting.push(data);
    this.pump();
    return { id: crypto.randomUUID() };
  }

  getWaitingCount(): Promise<number> { return Promise.resolve(this.waiting.length); }
  getActiveCount():  Promise<number> { return Promise.resolve(this.active); }

  private pump(): void {
    while (this.handler && this.active < this.concurrency && this.waiting.length) {
      const data = this.waiting.shift()!;
      this.active++;
      this.handler(data)
        .catch(() => undefined)
        .finally(() => { this.active--; this.pump(); });
    }
  }
}

export const testQueue = new LocalQueue<{ configId: string }>(
  Math.min(Math.max(Number(process.env.XRAY_MAX_PARALLEL ?? 16), 1), 64),
);

export const syncQueue = new LocalQueue<{ sourceId: string }>(2);