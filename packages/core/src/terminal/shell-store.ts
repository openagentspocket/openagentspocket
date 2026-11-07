import type { Clock } from '../hosts/cancellation';
import { type AttachStatus, AttachTerminalStore } from './attach-store';
import { PlainTerminalInput, type TerminalInputPort } from './input-port';
import { TerminalMouseModes } from './mouse-modes';
import { type RecoveryDecision, TerminalRecoveryGenerationLatch } from './recovery-latch';
import { TerminalTouchScroll } from './touch-scroll';
import { type TerminalSessionRunner, terminalTarget } from './types';

/** Stable remote identity kept after `tab.create` succeeds; attach and retries use `terminalId`. */
export interface ShellTerminalIdentity {
  readonly paneId: string;
  readonly tabId: string;
  readonly terminalId: string;
}

export interface ShellTerminalCreationRequest {
  readonly workspaceId: string;
  readonly cwd: string;
  readonly label?: string;
}

export interface ShellTerminalStoreOptions {
  readonly identity: ShellTerminalIdentity;
  readonly transportGeneration?: number | null;
  readonly takeover?: boolean;
  /** False once the owning screen left; a store off stage never starts or replaces a pipeline. */
  readonly isOnStage: () => boolean;
  readonly runTerminal: TerminalSessionRunner;
  readonly input?: TerminalInputPort;
  readonly clock: Clock;
}

type Lifecycle = 'active' | 'rejoinRequired' | 'left';

/**
 * Ordinary-shell owner around the shared PTY pipeline: replaces that pipeline across Host
 * generations and waits for teardown before the local destination changes. Attaches without
 * takeover until the user asks. (Swift `ShellTerminalStore`.)
 */
export class ShellTerminalStore {
  readonly identity: ShellTerminalIdentity;
  readonly input: TerminalInputPort;
  /** A drag on this shell, for as long as what runs in it tracks the mouse. */
  readonly touchScroll: TerminalTouchScroll;
  private readonly modes = new TerminalMouseModes();
  private current: AttachTerminalStore;
  private takeover: boolean;
  private transportGeneration: number | null;
  private lifecycle: Lifecycle = 'active';
  private chain: Promise<void> = Promise.resolve();
  private replacing = false;
  private replacementId = 0;
  private readonly recovery = new TerminalRecoveryGenerationLatch();
  private readonly listeners = new Set<() => void>();
  private version = 0;

  constructor(private readonly options: ShellTerminalStoreOptions) {
    this.identity = options.identity;
    this.input = options.input ?? new PlainTerminalInput(() => this.touchScroll.halt());
    this.touchScroll = new TerminalTouchScroll({
      clock: options.clock,
      modes: this.modes,
      paneId: options.identity.paneId,
      grid: () => this.current.grid,
      scroll: (sequence, rows) => this.input.scroll(sequence, rows),
    });
    this.takeover = options.takeover ?? false;
    this.transportGeneration = options.transportGeneration ?? null;
    this.current = this.makeTerminal();
  }

  /** The pipeline now in force; a different object after a replacement. */
  get terminal(): AttachTerminalStore {
    return this.current;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  /** Changes whenever the pipeline is replaced; pair with the terminal's own snapshot. */
  readonly getVersion = (): number => this.version;

  /** The status the screen shows: a pipeline being replaced reads as connecting. */
  get terminalStatus(): AttachStatus {
    const { status } = this.current;
    if (this.lifecycle !== 'active' || !this.options.isOnStage()) return status;
    if (this.replacing || status.kind === 'stopped') return { kind: 'connecting' };
    return status;
  }

  viewDidResize(cols: number, rows: number): void {
    if (this.lifecycle !== 'active' || !this.options.isOnStage()) return;
    this.current.viewDidResize(cols, rows);
  }

  send(data: Uint8Array): void {
    this.current.send(data);
  }

  retryTerminal(): void {
    this.current.retry();
  }

  /** Explicitly displaces another writable owner after a normal attach was refused. */
  takeOverTerminal(): void {
    this.takeover = true;
    this.replaceTerminal();
  }

  didBecomeActive(afterPossibleSuspension: boolean): void {
    if (!this.options.isOnStage()) return;
    if (this.lifecycle === 'rejoinRequired') {
      this.rejoin();
      return;
    }
    if (this.lifecycle !== 'active') return;
    if (!afterPossibleSuspension) {
      this.current.didBecomeActive();
      return;
    }
    if (this.recovery.isActive) return;
    if (this.replacing) {
      this.recovery.begin(this.transportGeneration);
      return;
    }
    const { status } = this.current;
    if (this.current.transportGeneration === this.transportGeneration) {
      if (status.kind === 'waitingForSize' || status.kind === 'connecting') return;
      // The connection outlived the trip away; a lost one arrives as a new generation.
      if (status.kind === 'live') {
        this.current.didBecomeActive();
        return;
      }
    }
    this.recovery.begin(this.transportGeneration);
    this.replaceTerminal();
  }

  transportGenerationDidChange(generation: number | null): void {
    if (generation === null || this.lifecycle !== 'active') return;
    const decision = this.recovery.recordProjection(generation);
    if (decision) {
      this.advance(generation);
      this.apply(decision);
      return;
    }
    if (this.current.transportGeneration === generation) {
      this.transportGeneration = generation;
      return;
    }
    if (generation === this.transportGeneration) return;
    this.transportGeneration = generation;
    this.replaceTerminal();
  }

  /** Back or close: waits for the PTY channel to end before the caller moves on. */
  leave(): Promise<void> {
    if (this.lifecycle === 'left') return this.chain;
    this.lifecycle = 'left';
    this.replacementId += 1;
    this.replacing = false;
    this.recovery.clear();
    return this.enqueue(() => this.current.stop());
  }

  rejoin(): void {
    if (this.lifecycle === 'active' || !this.options.isOnStage()) return;
    this.recovery.clear();
    this.lifecycle = 'active';
    this.replaceTerminal(true);
  }

  private replaceTerminal(skipStopIfStopped = false): void {
    if (this.lifecycle !== 'active' || !this.options.isOnStage()) return;
    this.replacementId += 1;
    const id = this.replacementId;
    this.replacing = true;
    void this.enqueue(async () => {
      if (this.replacementId !== id) return;
      if (!(skipStopIfStopped && this.current.status.kind === 'stopped')) {
        await this.current.stop({ preservingPendingPaste: true });
      }
      if (this.replacementId !== id || this.lifecycle !== 'active' || !this.options.isOnStage()) {
        this.abortOffStage(id);
        return;
      }
      this.current = this.makeTerminal();
      this.recovery.bind(this.current.surfaceId);
      this.replacing = false;
      this.version += 1;
      for (const listener of [...this.listeners]) listener();
    });
  }

  /** An invalidated replacement: the next on-stage signal rebuilds the same remembered terminal. */
  private abortOffStage(id: number): void {
    if (this.replacementId !== id) return;
    this.replacing = false;
    this.recovery.clear();
    if (this.lifecycle === 'active' && !this.options.isOnStage()) this.lifecycle = 'rejoinRequired';
  }

  private apply(decision: RecoveryDecision): void {
    switch (decision.kind) {
      case 'pending':
        return;
      case 'acknowledge':
      case 'retain':
        this.advance(decision.generation);
        return;
      case 'replace':
        this.advance(decision.generation);
        this.replaceTerminal();
    }
  }

  private advance(generation: number): void {
    if (this.transportGeneration === null || generation > this.transportGeneration) {
      this.transportGeneration = generation;
    }
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const task = this.chain.then(operation);
    this.chain = task.catch(() => undefined);
    return this.chain;
  }

  private makeTerminal(): AttachTerminalStore {
    this.modes.reset();
    this.touchScroll.modesDidChange();
    return new AttachTerminalStore({
      target: terminalTarget(this.identity.terminalId),
      takeover: this.takeover,
      input: this.input,
      transportGeneration: this.transportGeneration,
      observeOutput: (bytes) => {
        this.modes.receive(bytes);
        this.touchScroll.modesDidChange();
      },
      transportReady: (surfaceId, generation) => {
        const decision = this.recovery.recordAcquisition(generation, surfaceId);
        if (decision) this.apply(decision);
      },
      runDidFinish: (surfaceId) => this.recovery.clearBoundTo(surfaceId),
      runTerminal: this.options.runTerminal,
    });
  }
}
