import type { Clock } from '../hosts/cancellation';

// Port of Swift `TerminalMessageJumpController`. `herdr terminal attach` puts the surface on the
// alternate screen, where local scrollback is empty, so conversation history lives only inside the
// remote TUI. A jump is therefore an open loop: push a scroll step at the remote TUI, wait for the
// repainted frame, look at it, repeat. The app cannot learn how many rows a step moved, so
// termination is decided from frame content. The scroll position is remote state: a jump also
// moves the same terminal in a desktop herdr window.

export type JumpDirection = 'older' | 'newer';

export type JumpOutcome =
  /** A frame satisfying the policy was reached. */
  | 'found'
  /** The frame stopped changing before a match: top of history, or live bottom. */
  | 'reachedEnd'
  /** The step budget ran out with the frame still moving. */
  | 'exhausted'
  | 'cancelled';

export type MessageJumpPolicy =
  /** Remember the identities on screen at the press; stop when a different one appears. */
  | 'neighborAppearance'
  /**
   * A TUI that pins the current turn's prompt at the top of the viewport: walk older until the
   * identity changes, then reverse newer in one-row steps until it returns, but only if the walk
   * first traveled through frames that still showed it (otherwise the press already sat on the
   * boundary and the new identity is the neighbour).
   */
  | 'stickyPromptOvershoot';

export interface MessageJumpConfiguration {
  /** Rows requested by the opening steps, so a message above the fold lands near the top. */
  rowsPerStep: number;
  /** How many steps stay at `rowsPerStep` before the ramp starts. */
  fineSteps: number;
  /** Multiplier once the ramp starts: makes a distant message reachable in one press. */
  stepGrowth: number;
  /** Ceiling on a step when the viewport height is unknown (a step must never exceed the viewport). */
  maximumRowsPerStep: number;
  maxSteps: number;
  /** How long to wait for a repainted frame before the step counts as having produced nothing. */
  frameSettleTimeoutMs: number;
  /** Consecutive identical frames that mean the end was reached. */
  unchangedFramesBeforeEnd: number;
}

export const DEFAULT_JUMP_CONFIGURATION: MessageJumpConfiguration = {
  rowsPerStep: 8,
  fineSteps: 2,
  stepGrowth: 2,
  maximumRowsPerStep: 16,
  maxSteps: 60,
  frameSettleTimeoutMs: 600,
  unchangedFramesBeforeEnd: 2,
};

export interface MessageJumpDeps {
  clock: Clock;
  /** Pushes one scroll step at the remote TUI (the same path a drag uses). */
  step(direction: JumpDirection, rows: number): void;
  /** Stable identities of the user messages a frame shows (`AttachUserMessageIndex.visibleMessageKeys`). */
  visibleMessages(frameText: string): ReadonlySet<string>;
  /** Rows the grid shows, or null when unknown; caps the ramp. */
  viewportRows?(): number | null;
  configuration?: Partial<MessageJumpConfiguration>;
  policy?: MessageJumpPolicy;
}

type FrameWait = { kind: 'frame'; text: string } | { kind: 'timedOut' } | { kind: 'cancelled' };
type StepObservation =
  | { kind: 'cancelled' | 'reachedEnd' | 'unchanged' }
  | { kind: 'moved'; text: string };

/** One-row reverse after an overshoot; actual movement is unknowable, so it stays at one row. */
const STICKY_REVERSE_ROWS = 1;

const difference = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  [...a].filter((k) => !b.has(k));
const intersects = (a: ReadonlySet<string>, b: ReadonlySet<string>) => [...a].some((k) => b.has(k));

export class TerminalMessageJumpController {
  readonly configuration: MessageJumpConfiguration;
  readonly policy: MessageJumpPolicy;
  private _isRunning = false;
  private _lastRunMovedViewport = false;
  private latestFrame = '';
  private cancelRequested = false;
  private awaitingFrame = false;
  private bufferedFrame: string | null = null;
  private pending: { resolve: (result: FrameWait) => void; timer: unknown } | null = null;

  constructor(private readonly deps: MessageJumpDeps) {
    this.configuration = { ...DEFAULT_JUMP_CONFIGURATION, ...deps.configuration };
    this.policy = deps.policy ?? 'neighborAppearance';
  }

  /** True between a jump starting and returning; a second call meanwhile is refused. */
  get isRunning(): boolean {
    return this._isRunning;
  }

  /** Whether the last run observed at least one repainted frame that differed from the one before. */
  get lastRunMovedViewport(): boolean {
    return this._lastRunMovedViewport;
  }

  /** Rows to request on step `index`: flat for the fine steps, then geometric up to the ceiling. */
  rows(forStep: number): number {
    const c = this.configuration;
    const viewport = this.deps.viewportRows?.() ?? null;
    const ceiling =
      viewport !== null && viewport > 0
        ? Math.max(c.rowsPerStep, viewport - 2)
        : c.maximumRowsPerStep;
    if (forStep < c.fineSteps || c.stepGrowth <= 1) return Math.min(c.rowsPerStep, ceiling);
    let size = c.rowsPerStep;
    for (let i = 0; i < forStep - c.fineSteps + 1; i += 1) {
      if (size >= ceiling) break;
      size *= c.stepGrowth;
    }
    return Math.min(size, ceiling);
  }

  /** Fed from the viewport-text tap; legal and cheap while no jump is running. */
  frameDidChange(text: string): void {
    this.latestFrame = text;
    if (!this.awaitingFrame) return;
    this.bufferedFrame = text;
    this.resumeWait({ kind: 'frame', text });
  }

  /** Ends an in-flight jump; the awaiting call returns `cancelled`. */
  cancel(): void {
    this.cancelRequested = true;
    this.resumeWait({ kind: 'cancelled' });
  }

  /** Moves to the neighbouring user message in `direction`. */
  async jump(direction: JumpDirection): Promise<JumpOutcome> {
    if (this._isRunning) return 'cancelled';
    this.begin();
    try {
      if (this.policy === 'stickyPromptOvershoot' && direction === 'older') {
        const entry = this.deps.visibleMessages(this.latestFrame);
        if (entry.size > 0) return await this.jumpOlderSticky(entry);
      }
      return await this.jumpNeighbor(direction);
    } finally {
      this.finish();
    }
  }

  /** Scrolls forward until the frame stops changing (the live bottom). */
  async returnToLive(): Promise<JumpOutcome> {
    if (this._isRunning) return 'cancelled';
    this.begin();
    try {
      let previous = this.latestFrame;
      let unchanged = 0;
      for (let index = 0; index < this.configuration.maxSteps; index += 1) {
        if (this.cancelRequested) return 'cancelled';
        const observed = await this.observe('newer', this.rows(index), previous, unchanged);
        if (observed.result.kind === 'cancelled') return 'cancelled';
        if (observed.result.kind === 'reachedEnd') return 'reachedEnd';
        ({ previous, unchanged } = observed);
      }
      return 'exhausted';
    } finally {
      this.finish();
    }
  }

  private async jumpNeighbor(direction: JumpDirection): Promise<JumpOutcome> {
    const seen = new Set(this.deps.visibleMessages(this.latestFrame));
    let previous = this.latestFrame;
    let unchanged = 0;
    for (let index = 0; index < this.configuration.maxSteps; index += 1) {
      if (this.cancelRequested) return 'cancelled';
      const observed = await this.observe(direction, this.rows(index), previous, unchanged);
      ({ previous, unchanged } = observed);
      const result = observed.result;
      if (result.kind === 'cancelled') return 'cancelled';
      if (result.kind === 'reachedEnd') return 'reachedEnd';
      if (result.kind !== 'moved') continue;
      const messages = this.deps.visibleMessages(result.text);
      if (difference(messages, seen).length > 0) return 'found';
      for (const key of messages) seen.add(key);
    }
    return 'exhausted';
  }

  private async jumpOlderSticky(entry: ReadonlySet<string>): Promise<JumpOutcome> {
    let previous = this.latestFrame;
    let unchanged = 0;
    let reversing = false;
    let traveledThroughEntry = false;
    let olderIndex = 0;
    for (let n = 0; n < this.configuration.maxSteps; n += 1) {
      if (this.cancelRequested) return 'cancelled';
      const direction: JumpDirection = reversing ? 'newer' : 'older';
      const rows = reversing ? STICKY_REVERSE_ROWS : this.rows(olderIndex++);
      const observed = await this.observe(direction, rows, previous, unchanged);
      ({ previous, unchanged } = observed);
      const result = observed.result;
      if (result.kind === 'cancelled') return 'cancelled';
      if (result.kind === 'reachedEnd') return 'reachedEnd';
      if (result.kind !== 'moved') continue;
      const messages = this.deps.visibleMessages(result.text);
      if (reversing) {
        if (intersects(messages, entry)) return 'found';
        continue;
      }
      if (intersects(messages, entry)) {
        if (difference(messages, entry).length > 0) return 'found';
        traveledThroughEntry = true;
        continue;
      }
      if (messages.size === 0) continue;
      if (traveledThroughEntry) {
        reversing = true;
        continue;
      }
      return 'found';
    }
    return 'exhausted';
  }

  /** Pushes one step and classifies the repaint; timeouts and identical frames count toward the end. */
  private async observe(
    direction: JumpDirection,
    rows: number,
    previous: string,
    unchanged: number,
  ): Promise<{ result: StepObservation; previous: string; unchanged: number }> {
    this.awaitingFrame = true;
    this.bufferedFrame = null;
    this.deps.step(direction, rows);
    const waited = await this.waitForFrame();
    if (waited.kind === 'cancelled') return { result: { kind: 'cancelled' }, previous, unchanged };
    const same = waited.kind === 'timedOut' || waited.text === previous;
    if (same) {
      const count = unchanged + 1;
      const ended = count >= this.configuration.unchangedFramesBeforeEnd;
      return { result: { kind: ended ? 'reachedEnd' : 'unchanged' }, previous, unchanged: count };
    }
    this._lastRunMovedViewport = true;
    return { result: { kind: 'moved', text: waited.text }, previous: waited.text, unchanged: 0 };
  }

  private waitForFrame(): Promise<FrameWait> {
    if (this.cancelRequested) return this.settle({ kind: 'cancelled' });
    if (this.bufferedFrame !== null)
      return this.settle({ kind: 'frame', text: this.bufferedFrame });
    return new Promise<FrameWait>((resolve) => {
      const timer = this.deps.clock.setTimeout(
        () => this.resumeWait({ kind: 'timedOut' }),
        this.configuration.frameSettleTimeoutMs,
      );
      this.pending = { resolve, timer };
    }).then((result) => this.settle(result));
  }

  /** Prefers the latest paint of the burst; cancel wins over a frame that already resumed us. */
  private settle(result: FrameWait): Promise<FrameWait> {
    this.awaitingFrame = false;
    const buffered = this.bufferedFrame;
    this.bufferedFrame = null;
    if (this.cancelRequested) return Promise.resolve({ kind: 'cancelled' });
    if (result.kind === 'frame')
      return Promise.resolve({ kind: 'frame', text: buffered ?? this.latestFrame });
    return Promise.resolve(result);
  }

  private resumeWait(result: FrameWait): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    this.deps.clock.clearTimeout(pending.timer);
    pending.resolve(result);
  }

  private begin(): void {
    this._isRunning = true;
    this._lastRunMovedViewport = false;
    this.cancelRequested = false;
  }

  private finish(): void {
    this.awaitingFrame = false;
    this.bufferedFrame = null;
    this.resumeWait({ kind: 'cancelled' });
    this.cancelRequested = false;
    this._isRunning = false;
  }
}
