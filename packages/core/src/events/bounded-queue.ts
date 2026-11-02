export type PushResult = 'enqueued' | 'dropped' | 'terminated';

interface Waiter<T> {
  resolve(result: IteratorResult<T, undefined>): void;
  reject(error: unknown): void;
}

/**
 * A single-consumer async queue that keeps the newest `limit` undelivered
 * items (Swift's `AsyncStream` with `.bufferingNewest`): a push into a full
 * buffer sheds the oldest and reports `'dropped'`, so producers can follow
 * it with a drop marker. An item pushed while the consumer waits goes
 * straight to it. `finish(error)` delivers the buffered items first, then
 * ends (or rejects with `error`).
 */
export class BoundedQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private head = 0;
  private waiter: Waiter<T> | undefined;
  private finished = false;
  private failure: { error: unknown } | undefined;

  constructor(readonly limit = Number.POSITIVE_INFINITY) {
    if (!(limit >= 1)) throw new RangeError('BoundedQueue limit must be at least 1');
  }

  /** Undelivered items. */
  get size(): number {
    return this.items.length - this.head;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  push(item: T): PushResult {
    if (this.finished) return 'terminated';
    const waiter = this.waiter;
    if (waiter) {
      this.waiter = undefined;
      waiter.resolve({ value: item, done: false });
      return 'enqueued';
    }
    this.items.push(item);
    if (this.size <= this.limit) return 'enqueued';
    this.head += 1;
    this.compact();
    return 'dropped';
  }

  /** Ends the queue; later pushes are `'terminated'`. Idempotent. */
  finish(error?: unknown): void {
    if (this.finished) return;
    this.finished = true;
    if (error !== undefined) this.failure = { error };
    const waiter = this.waiter;
    if (!waiter) return;
    this.waiter = undefined;
    if (this.failure) waiter.reject(this.failure.error);
    else waiter.resolve({ value: undefined, done: true });
  }

  next(): Promise<IteratorResult<T, undefined>> {
    if (this.size > 0) {
      const value = this.items[this.head] as T;
      this.head += 1;
      this.compact();
      return Promise.resolve({ value, done: false });
    }
    if (this.finished) {
      const failure = this.failure;
      if (failure) {
        this.failure = undefined;
        return Promise.reject(failure.error);
      }
      return Promise.resolve({ value: undefined, done: true });
    }
    if (this.waiter) return Promise.reject(new Error('BoundedQueue supports a single consumer'));
    return new Promise((resolve, reject) => {
      this.waiter = { resolve, reject };
    });
  }

  [Symbol.asyncIterator](): AsyncIterator<T, undefined> {
    return { next: () => this.next() };
  }

  private compact() {
    if (this.head === this.items.length) {
      this.items = [];
      this.head = 0;
    } else if (this.head > 1024 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
  }
}
