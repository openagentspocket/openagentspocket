import type { Clock } from './clock';

interface Timer {
  readonly id: number;
  readonly at: number;
  readonly callback: () => void;
}

/**
 * A manual clock for tests. `advance` fires due timers in time order and
 * lets the code they wake run (through `settle`) before firing the next, so
 * timers scheduled by that code inside the window fire too.
 *
 * `settle` must drain pending promise work; in Node tests pass
 * `() => new Promise((resolve) => setImmediate(resolve))`.
 */
export class FakeClock implements Clock {
  private time = 0;
  private nextId = 0;
  private timers: Timer[] = [];

  constructor(private readonly settle: () => Promise<void>) {}

  now(): number {
    return this.time;
  }

  setTimer(ms: number, callback: () => void): () => void {
    const timer = { id: this.nextId++, at: this.time + Math.max(0, ms), callback };
    this.timers.push(timer);
    return () => {
      this.timers = this.timers.filter((entry) => entry !== timer);
    };
  }

  /** Timers still waiting to fire. */
  get pendingTimers(): number {
    return this.timers.length;
  }

  /** Moves time forward by `ms`, firing every timer that falls due. */
  async advance(ms: number): Promise<void> {
    const target = this.time + ms;
    await this.settle();
    for (;;) {
      const due = this.timers
        .filter((timer) => timer.at <= target)
        .sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.timers = this.timers.filter((timer) => timer !== due);
      this.time = due.at;
      due.callback();
      await this.settle();
    }
    this.time = target;
    await this.settle();
  }

  /** Lets pending promise work run without moving time. */
  flush(): Promise<void> {
    return this.settle();
  }
}
