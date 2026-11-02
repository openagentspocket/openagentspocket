// A pause-and-repeat loop that can be woken early and stopped, one `step` at a time (the loop of
// Swift AgentChatStore). A stop waits for the step in flight before `onStopped` runs, and a new
// loop waits for the previous one to finish, so two loops never overlap.

import { asTransportError } from '../../errors';
import type { Clock } from '../../hosts/cancellation';

export interface LoopRunnerOptions {
  clock: Clock;
  step(): Promise<void>;
  /** The pause after each step, in milliseconds. */
  interval(): number;
  /** A step threw something other than a cancellation. */
  onError(thrown: unknown): void;
  /** Runs after a loop stopped and its last step finished (for example, a forced save). */
  onStopped(): Promise<void>;
}

export class LoopRunner {
  private running = false;
  private token = 0;
  private sleeper: (() => void) | null = null;
  private wakeRequested = false;
  private finishing: Promise<void> = Promise.resolve();

  constructor(private readonly options: LoopRunnerOptions) {}

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const token = ++this.token;
    const previous = this.finishing;
    const loop = (async () => {
      await previous;
      while (this.running && token === this.token) {
        try {
          await this.options.step();
        } catch (thrown) {
          if (asTransportError(thrown).kind !== 'cancelled') this.options.onError(thrown);
        }
        if (!this.running || token !== this.token) return;
        await this.pause(this.options.interval());
      }
    })();
    this.finishing = loop;
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.token += 1;
    this.sleeper?.();
    const loop = this.finishing;
    this.finishing = loop.then(() => this.options.onStopped()).catch(() => undefined);
  }

  /** Cuts the current pause short (or the next one, when a step is running). */
  wake(): void {
    if (this.sleeper) this.sleeper();
    else this.wakeRequested = true;
  }

  private pause(ms: number): Promise<void> {
    if (this.wakeRequested) {
      this.wakeRequested = false;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const { clock } = this.options;
      const done = () => {
        clock.clearTimeout(handle);
        this.sleeper = null;
        this.wakeRequested = false;
        resolve();
      };
      const handle = clock.setTimeout(done, ms);
      this.sleeper = done;
    });
  }
}
