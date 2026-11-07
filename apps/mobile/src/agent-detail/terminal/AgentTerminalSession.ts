import {
  AgentMessageJump,
  type AgentMessageJumpDeps,
  AttachTerminalStore,
  type Clock,
  type RecoveryDecision,
  TerminalInputController,
  TerminalKeyboardControl,
  TerminalMouseModes,
  TerminalRecoveryGenerationLatch,
  type TerminalSessionRunner,
  TerminalTouchScroll,
} from '@openagentspocket/core';

/** What one Agent's terminal needs from its Host. */
export interface TerminalHostPort {
  readonly runner: TerminalSessionRunner;
  readonly clock: Clock;
  /** The newest ping-proven Transport generation the Host reported. */
  transportGeneration(): number;
  /** Fires whenever the Host's state (and so possibly its generation) changed. */
  subscribe(listener: () => void): () => void;
}

/**
 * One Agent detail visit's terminal: the attach store, the input controller that owns the
 * writer, and the sticky-key state. A foreground return that finds the Host on a newer
 * Transport replaces the store (a new surface, so a keyed view) and keeps a pending reviewed
 * paste (Swift `AgentAttachStore` composition over `TerminalRecoveryGenerationLatch`).
 */
export class AgentTerminalSession {
  readonly input = new TerminalInputController({
    observeOutgoing: (data, source) => {
      this.touchScroll.halt();
      this.jump?.observeOutgoing(data, source);
    },
    observeSubmitted: (text) => this.jump?.recordSubmitted(text),
    sessionDidReset: () => {
      this.modes.reset();
      this.touchScroll.modesDidChange();
      this.jump?.reset();
    },
  });
  readonly keyboard = new TerminalKeyboardControl({ send: (bytes) => this.input.send(bytes) });
  /** A drag on the terminal; a Message Jump in flight gives way to it. */
  readonly touchScroll: TerminalTouchScroll;
  private readonly modes = new TerminalMouseModes();
  private jump: AgentMessageJump | null = null;
  private current: AttachTerminalStore;
  private readonly latch = new TerminalRecoveryGenerationLatch();
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribeHost: () => void;
  private disposed = false;

  constructor(
    private readonly paneId: string,
    private readonly host: TerminalHostPort,
  ) {
    this.touchScroll = new TerminalTouchScroll({
      clock: host.clock,
      modes: this.modes,
      paneId,
      grid: () => this.current.grid,
      scroll: (sequence, rows) => this.input.scroll(sequence, rows),
      didScroll: () => this.jump?.cancel(),
    });
    this.current = this.makeStore();
    this.unsubscribeHost = host.subscribe(() => this.hostChanged());
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  readonly getStore = (): AttachTerminalStore => this.current;

  private makeStore(): AttachTerminalStore {
    return new AttachTerminalStore({
      target: this.paneId,
      input: this.input,
      transportGeneration: this.host.transportGeneration(),
      runTerminal: this.host.runner,
      observeOutput: (bytes) => {
        this.modes.receive(bytes);
        this.touchScroll.modesDidChange();
      },
      transportReady: (surfaceId, generation) =>
        this.apply(this.latch.recordAcquisition(generation, surfaceId)),
      runDidFinish: (surfaceId) => this.latch.clearBoundTo(surfaceId),
    });
  }

  /** A Message Jump over this session's scroll path, for whichever store is current. */
  makeMessageJump(
    deps: Pick<AgentMessageJumpDeps, 'clock' | 'readFrame' | 'profile'>,
  ): AgentMessageJump {
    return new AgentMessageJump({
      ...deps,
      modes: this.modes,
      grid: () => this.current.grid,
      scroll: (sequence, rows) => this.input.scroll(sequence, rows),
    });
  }

  /** Lets `jump` see this session's input and resets; the returned function ends it for good. */
  bindMessageJump(jump: AgentMessageJump): () => void {
    this.jump = jump;
    return () => {
      jump.cancel();
      if (this.jump === jump) this.jump = null;
    };
  }

  /** The app returned to the foreground: reconcile the Host's Transport with this pipeline's. */
  didBecomeActive(): void {
    if (this.disposed) return;
    this.latch.begin(this.host.transportGeneration());
    this.latch.bind(this.current.surfaceId);
  }

  private hostChanged(): void {
    if (this.disposed) return;
    this.apply(this.latch.recordProjection(this.host.transportGeneration()));
  }

  private apply(decision: RecoveryDecision | null): void {
    if (decision?.kind !== 'replace' || this.disposed) return;
    const previous = this.current;
    this.input.detachSessionForReplacement();
    this.current = this.makeStore();
    for (const listener of [...this.listeners]) listener();
    void previous.stop({ preservingPendingPaste: true });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeHost();
    this.latch.clear();
    this.touchScroll.halt();
    await this.current.stop();
  }
}
