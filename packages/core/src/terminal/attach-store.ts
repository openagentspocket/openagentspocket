import { presentation } from '../errors/presentation';
import { message, type Text } from '../errors/text';
import { TransportFailure } from '../errors/transport-error';
import { createCancellation } from '../hosts/cancellation';
import { TerminalByteFeed } from './byte-feed';
import { PlainTerminalInput, type TerminalInputPort } from './input-port';
import { newTerminalSurfaceId, type TerminalSurfaceId } from './recovery-latch';
import { makeSessionHandler } from './session-handler';
import {
  agentPaneTarget,
  type TerminalAttachSession,
  type TerminalAttachTarget,
  type TerminalSessionRunner,
} from './types';

export type AttachStatus =
  /** Waiting for the terminal view's first layout to report cols/rows. */
  | { readonly kind: 'waitingForSize' }
  /** Opening the channel and waiting for the remote attach to say something. */
  | { readonly kind: 'connecting' }
  /** The new PTY Attach has produced output and owns the input writer. */
  | { readonly kind: 'live' }
  /** The Host's connection dropped under the session; the store reattaches by itself. */
  | { readonly kind: 'reconnecting' }
  /** Ended remotely or by failure; `retry()` reattaches. `message` is user-facing. */
  | { readonly kind: 'ended'; readonly message: Text }
  /** `stop()` was called; terminal. */
  | { readonly kind: 'stopped' };

export interface AttachSnapshot {
  readonly status: AttachStatus;
  readonly surfaceId: TerminalSurfaceId;
}

export interface AttachTerminalStoreOptions {
  readonly target: TerminalAttachTarget | string;
  readonly takeover?: boolean;
  readonly input?: TerminalInputPort;
  readonly transportGeneration?: number | null;
  readonly observeOutput?: (bytes: Uint8Array) => void;
  readonly finishOutput?: () => void;
  readonly transportReady?: (surfaceId: TerminalSurfaceId, generation: number) => void;
  readonly runDidFinish?: (surfaceId: TerminalSurfaceId) => void;
  readonly runTerminal: TerminalSessionRunner;
}

/** Reattaches in a row that may fail before the remote paints: the loss, and one more redial. */
export const REATTACH_LIMIT = 2;

const m = message;

/** The connection under the session dropped or was replaced: the next Transport can carry a reattach. */
export function isConnectionLoss(error: unknown): boolean {
  if (!(error instanceof TransportFailure)) return false;
  const { kind } = error.error;
  return kind === 'sshUnreachable' || kind === 'timedOut' || kind === 'cancelled';
}

/** The user-facing words for a session failure. */
export function attachFailureMessage(error: unknown): Text {
  if (error instanceof TransportFailure) {
    switch (error.error.kind) {
      case 'sshUnreachable':
        return m('The Host is not connected.');
      case 'terminalChannelAlreadyOpen':
        return m('Another terminal is already open on this Host.');
      case 'timedOut':
        return m('The Host did not answer in time.');
      case 'cancelled':
        // Attach is cancelled under the user when the Host's connection is replaced or wound down.
        return m("The Host's connection was reset.");
      default: {
        // Includes `attachExited`, which quotes herdr's own last line, and `herdrBinaryNotFound`.
        const shown = presentation(error.error);
        const parts: Text[] = [shown.summary];
        if (shown.detail !== undefined) parts.push(shown.detail);
        if (shown.recovery !== undefined) parts.push(shown.recovery);
        return { join: parts, separator: ' ' };
      }
    }
  }
  // A non-Transport error has no user-facing words of its own.
  return m('The session failed.');
}

/**
 * The Agent detail screen's session pipeline: a full interactive terminal over the Host's
 * terminal channel. Raw PTY bytes go to the view through a `TerminalByteFeed`, keystrokes come
 * back out, geometry changes ride the live channel as window-change.
 *
 * Nothing starts until the view's first size report, so the PTY opens with real cols/rows. A
 * later resize never restarts anything. One session per run; the remote attach exiting
 * surfaces as `ended` with reattach offered (Swift `AttachTerminalStore`).
 */
export class AttachTerminalStore {
  readonly feed = new TerminalByteFeed();
  /** Unique for the store's lifetime, so a replacement is always a different surface. */
  readonly surfaceId: TerminalSurfaceId = newTerminalSurfaceId();
  transportGeneration: number | null;
  /** What this pipeline actually acquired from its runner; never seeded from a projection. */
  acquiredTransportGeneration: number | null = null;

  private snapshot: AttachSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly target: TerminalAttachTarget;
  private readonly takeover: boolean;
  private readonly input: TerminalInputPort;
  private readonly options: AttachTerminalStoreOptions;
  private cols: number | null = null;
  private rows: number | null = null;
  private attemptTransportGeneration: number | null = null;
  private stopRequested = false;
  private preservesPendingPasteOnStop = false;
  private session: TerminalAttachSession | null = null;
  private inputGeneration: number | null = null;
  private runPromise: Promise<void> | null = null;
  private cancellation = createCancellation();

  constructor(options: AttachTerminalStoreOptions) {
    this.options = options;
    this.target =
      typeof options.target === 'string' ? agentPaneTarget(options.target) : options.target;
    this.takeover = options.takeover ?? false;
    this.input = options.input ?? new PlainTerminalInput();
    this.transportGeneration = options.transportGeneration ?? null;
    this.snapshot = { status: { kind: 'waitingForSize' }, surfaceId: this.surfaceId };
  }

  // React binding: useSyncExternalStore(store.subscribe, store.getSnapshot).
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  readonly getSnapshot = (): AttachSnapshot => this.snapshot;

  get status(): AttachStatus {
    return this.snapshot.status;
  }

  private setStatus(status: AttachStatus): void {
    this.snapshot = { status, surfaceId: this.surfaceId };
    for (const listener of [...this.listeners]) listener();
  }

  /** The view's geometry, on first layout and on every change; the first report opens the session. */
  viewDidResize(cols: number, rows: number): void {
    if (!(cols > 0 && rows > 0) || (cols === this.cols && rows === this.rows)) return;
    this.cols = cols;
    this.rows = rows;
    if (this.runPromise === null) {
      if (this.status.kind === 'waitingForSize') this.start();
      // `ended` waits for retry(); `stopped` is terminal.
    } else {
      this.session?.resize(cols, rows);
    }
  }

  /** Keystrokes from the view, forwarded raw; dropped while no session is live. */
  send(keystrokes: Uint8Array): void {
    this.input.send(keystrokes);
  }

  /**
   * The app returned to the foreground. A short bounce asks the remote TUI to repaint without
   * replacing the session: a window-change only reaches the remote when the size changes, so
   * the nudge is a shrink followed by a restore, in order on the live channel. The store's own
   * geometry is untouched.
   */
  didBecomeActive(): void {
    const { cols, rows, session } = this;
    if (this.status.kind !== 'live' || !session || cols === null || rows === null || cols <= 1) {
      return;
    }
    session.resize(cols - 1, rows);
    session.resize(cols, rows);
  }

  /** Reattaches after the session ended. */
  retry(): void {
    if (this.status.kind === 'ended' && this.runPromise === null) this.start();
  }

  /**
   * Ends the session by explicit close and waits for the teardown. Terminal. The run is also
   * cancelled: before a session exists it can be queued for the Host's terminal channel, and a
   * stop must never depend on the channel becoming available. Safe to call repeatedly.
   */
  async stop(options: { preservingPendingPaste?: boolean } = {}): Promise<void> {
    this.stopRequested = true;
    this.preservesPendingPasteOnStop = options.preservingPendingPaste ?? false;
    await this.session?.end();
    this.cancellation.cancel();
    await this.runPromise;
    this.setStatus({ kind: 'stopped' });
  }

  private start(): void {
    this.setStatus({ kind: 'connecting' });
    this.cancellation = createCancellation();
    this.runPromise = this.run();
  }

  /**
   * One session lifetime: open at the current geometry, pump output until the stream ends,
   * surface how it ended. A connection lost under a session that had its Transport reattaches
   * instead of ending: the Host redials behind a status that still reads connected. Reattaches
   * that never get the remote to paint are bounded so a failing link ends the session rather
   * than redialing the Host forever.
   */
  private async run(): Promise<void> {
    // Let `start()` record this promise before any synchronous failure runs the `finally`.
    await Promise.resolve();
    let reattachesSinceLive = 0;
    try {
      for (;;) {
        const { cols, rows } = this;
        if (cols === null || rows === null) return;
        this.attemptTransportGeneration = null;
        try {
          await this.attach(cols, rows);
        } catch (error) {
          if (this.stopRequested) return;
          if (this.status.kind === 'live') reattachesSinceLive = 0;
          if (
            this.attemptTransportGeneration !== null &&
            isConnectionLoss(error) &&
            reattachesSinceLive < REATTACH_LIMIT
          ) {
            reattachesSinceLive += 1;
            this.setStatus({ kind: 'reconnecting' });
            continue;
          }
          this.setStatus({ kind: 'ended', message: attachFailureMessage(error) });
          return;
        }
        if (this.stopRequested) return;
        this.setStatus({ kind: 'ended', message: m('The session ended.') });
        return;
      }
    } finally {
      this.runPromise = null;
      this.options.runDidFinish?.(this.surfaceId);
    }
  }

  private attach(cols: number, rows: number): Promise<void> {
    const handler = makeSessionHandler(
      (session) => this.consume(session, cols, rows),
      (generation) => {
        this.transportGeneration = generation;
        this.acquiredTransportGeneration = generation;
        this.attemptTransportGeneration = generation;
        this.options.transportReady?.(this.surfaceId, generation);
      },
    );
    return this.options.runTerminal(
      { target: this.target, takeover: this.takeover, cols, rows },
      handler,
      this.cancellation.signal,
    );
  }

  private async consume(
    session: TerminalAttachSession,
    initialCols: number,
    initialRows: number,
  ): Promise<void> {
    try {
      if (this.stopRequested) {
        await session.end();
        return;
      }
      this.session = session;
      const generation = this.input.beginSession({
        write: (data) => session.send(data),
        scroll: (sequence, rows) => session.scroll(sequence, rows),
      });
      this.inputGeneration = generation;
      if (
        this.cols !== null &&
        this.rows !== null &&
        (this.cols !== initialCols || this.rows !== initialRows)
      ) {
        // The view resized while the channel was coming up; catch the remote PTY up.
        session.resize(this.cols, this.rows);
      }
      try {
        for await (const bytes of session.output) {
          // Live when the new PTY Attach produces output, not when the channel opens: the
          // transport withholds the login shell's noise, so an open channel with no output
          // yet is still connecting. It does not prove a renderer presented the bytes.
          const { kind } = this.status;
          if (kind === 'connecting' || kind === 'reconnecting') {
            this.setStatus({ kind: 'live' });
            this.input.sessionDidBecomeLive(generation);
          }
          this.options.observeOutput?.(bytes);
          this.feed.write(bytes);
        }
      } finally {
        this.finishSession(generation);
      }
    } finally {
      this.options.finishOutput?.();
    }
  }

  private finishSession(generation: number): void {
    this.session = null;
    this.input.endSession(generation, {
      preservingPendingPaste: this.preservesPendingPasteOnStop,
    });
    if (this.inputGeneration === generation) this.inputGeneration = null;
  }
}
