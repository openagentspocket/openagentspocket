import { errorMessage } from '../errors/message';
import type { Clock } from '../hosts/cancellation';

/** What a Stop tap came to. `sent` means only that the keys left the app. */
export type AgentInterruptOutcome =
  | { readonly kind: 'sent' }
  | { readonly kind: 'failed'; readonly message: string };

/** How one surface's Stop waits after a press. */
export interface AgentStopWait {
  /** How long Stop waits for Agent Status to leave Working, ignoring taps. */
  readonly windowMs: number;
  /** What Stop says when the window passed with the Agent still Working. */
  readonly unconfirmedNotice: string;
  /** The least time from the end of one attempt to the next press. Zero keeps Esc's behavior. */
  readonly minimumGapMs?: number;
}

/** One Esc's wait: the terminal's Stop, and Chat's in Claude Code, Codex, Pi and Oh My Pi. */
export const ESCAPE_WAIT: AgentStopWait = {
  windowMs: 3000,
  unconfirmedNotice: 'Esc went, but the Agent still shows Working.',
};

export type ComposerPrimaryControl = 'send' | 'stop';

/**
 * While the Agent is Working and the draft is blank the trailing button is Stop; with text it
 * stays Send, so a prompt can still reach the running turn.
 */
export function primaryControl(input: {
  status: string;
  draft: string;
  canStop: boolean;
  /** The message has something to send even with a blank draft. */
  hasAttachments?: boolean;
}): ComposerPrimaryControl {
  const blank = input.draft.trim().length === 0 && !input.hasAttachments;
  return input.canStop && input.status === 'working' && blank ? 'stop' : 'send';
}

export type StopPhase =
  | { readonly kind: 'ready' }
  /** The keys are on their way, or went and the Agent is still Working. */
  | { readonly kind: 'stopping' }
  /** The window passed with the Agent still Working. */
  | { readonly kind: 'unconfirmed' }
  /** Nothing was pressed, or the keys may not have gone; Stop works again at once. */
  | { readonly kind: 'failed'; readonly message: string };

/**
 * The Composer's Stop. Each tap presses the surface's keys once, then waits for Agent Status to
 * leave Working instead of pressing again: an Esc that lands after the turn ended can open the
 * program's own history. Past the window Stop works again. A send that empties the draft holds
 * Stop back for a moment, since Stop takes Send's place.
 */
export class ComposerStopStore {
  private current: StopPhase = { kind: 'ready' };
  private held = false;
  private generation = 0;
  private holdGeneration = 0;
  private unconfirmedNotice = ESCAPE_WAIT.unconfirmedNotice;
  private attemptsOnTheirWay = 0;
  private lastAttemptEnded: number | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly clock: Clock,
    private readonly sendHoldMs = 1000,
  ) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get phase(): StopPhase {
    return this.current;
  }

  get isStopping(): boolean {
    return this.current.kind === 'stopping';
  }

  /** Stop stays Send for a moment after a send emptied the draft. */
  get isHeldAfterSend(): boolean {
    return this.held;
  }

  /** Why the last Stop has not shown its effect. */
  get notice(): string | undefined {
    if (this.current.kind === 'unconfirmed') return this.unconfirmedNotice;
    return this.current.kind === 'failed' ? this.current.message : undefined;
  }

  /**
   * Presses the keys through `interrupt`, then waits as `wait` says, unless an earlier press is
   * still waiting on the Agent. Returns the whole attempt, or undefined when nothing was pressed.
   */
  stop(
    interrupt: () => Promise<AgentInterruptOutcome>,
    wait: AgentStopWait = ESCAPE_WAIT,
  ): Promise<void> | undefined {
    if (this.current.kind === 'stopping') return undefined;
    const gap = wait.minimumGapMs ?? 0;
    if (gap > 0) {
      if (this.attemptsOnTheirWay > 0) return undefined;
      if (
        this.lastAttemptEnded !== undefined &&
        this.clock.monotonicMs() - this.lastAttemptEnded < gap
      ) {
        return undefined;
      }
    }
    this.unconfirmedNotice = wait.unconfirmedNotice;
    this.generation += 1;
    const generation = this.generation;
    this.set({ kind: 'stopping' });
    this.attemptsOnTheirWay += 1;
    return this.run(interrupt, generation, wait.windowMs);
  }

  private async run(
    interrupt: () => Promise<AgentInterruptOutcome>,
    generation: number,
    windowMs: number,
  ): Promise<void> {
    let outcome: AgentInterruptOutcome;
    try {
      outcome = await interrupt();
    } catch (error) {
      outcome = { kind: 'failed', message: errorMessage(error) };
    }
    this.attemptsOnTheirWay -= 1;
    this.lastAttemptEnded = this.clock.monotonicMs();
    if (this.generation !== generation) return;
    if (outcome.kind === 'failed') {
      this.set({ kind: 'failed', message: outcome.message });
      return;
    }
    await new Promise<void>((resolve) => this.clock.setTimeout(resolve, windowMs));
    if (this.generation === generation) this.set({ kind: 'unconfirmed' });
  }

  /** A send just emptied the draft; the hold ends after the send hold. */
  holdAfterSend(): void {
    this.holdGeneration += 1;
    const generation = this.holdGeneration;
    this.held = true;
    this.notify();
    this.clock.setTimeout(() => {
      if (this.holdGeneration !== generation) return;
      this.held = false;
      this.notify();
    }, this.sendHoldMs);
  }

  /** Any status but Working ends the wait: the Agent stopped, finished or turned to a dialog. */
  agentStatusChanged(status: string): void {
    if (status === 'working') return;
    this.generation += 1;
    this.set({ kind: 'ready' });
  }

  private set(phase: StopPhase): void {
    this.current = phase;
    this.notify();
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
