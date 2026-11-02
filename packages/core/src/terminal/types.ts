import type { CancelSignal } from '../hosts/cancellation';

/**
 * The remote object one interactive PTY Attach resolves: an Agent's Pane (`herdr agent attach`)
 * or an ordinary shell terminal (`herdr terminal attach`, by the id `tab.create` returned).
 */
export type TerminalAttachTarget =
  | { readonly kind: 'agentPane'; readonly id: string }
  | { readonly kind: 'terminal'; readonly id: string };

export const agentPaneTarget = (id: string): TerminalAttachTarget => ({ kind: 'agentPane', id });
export const terminalTarget = (id: string): TerminalAttachTarget => ({ kind: 'terminal', id });

/** A stable map key: one channel per target per Host. */
export const targetKey = (target: TerminalAttachTarget): string => `${target.kind}:${target.id}`;

/** One interactive terminal request: its target, herdr's takeover flag and the initial PTY size. */
export interface TerminalAttachRequest {
  readonly target: TerminalAttachTarget;
  readonly takeover: boolean;
  readonly cols: number;
  readonly rows: number;
}

/**
 * A live interactive Attach session over its Host's terminal channel: raw PTY bytes out,
 * keystrokes and window changes in.
 *
 * Ending is explicit: call `end()`. Dropping the session, or abandoning the loop that reads
 * `output`, leaves the channel open until the SSH connection closes.
 */
export interface TerminalAttachSession {
  /**
   * Raw PTY output in arrival order. Finishes when the remote attach exits cleanly or after
   * `end()`; rejects if the channel dies. Each access returns its own iterable over the shared
   * source; only the first to read claims it, and a second reader is refused with
   * `terminalChannelAlreadyOpen` without disturbing the first.
   */
  readonly output: AsyncIterable<Uint8Array>;
  /** Raw keystrokes to the PTY. Fire-and-forget: a dead channel drops them. */
  send(keystrokes: Uint8Array): void;
  /** Lossy, coalesced touch-scroll rows: typing never waits behind old momentum. */
  scroll(sequence: Uint8Array, rows: number): void;
  /** SSH window-change to the remote PTY; no reattach needed. */
  resize(cols: number, rows: number): void;
  /** Closes the channel and waits for its teardown. Idempotent. */
  end(): Promise<void>;
}

/** What a runner hands a freshly opened session to, and how the session's lifetime is owned. */
export interface TerminalSessionHandler {
  /** The Transport generation this attempt acquired. */
  transportDidBecomeReady(generation: number): void;
  run(session: TerminalAttachSession): Promise<void>;
  /**
   * One complete session lifetime with owned teardown: runs the handler, then ends the channel
   * on success and on every failure except `terminalChannelAlreadyOpen`. That refusal means this
   * consumer never owned the session; ending it would tear down the legitimate consumer's live
   * terminal. The refusal still propagates so the offending surface shows it.
   */
  runEndingSession(session: TerminalAttachSession): Promise<void>;
}

/**
 * Opens a session for `request` and gives it to `handler`. Rejects with a `TransportFailure`.
 * `signal` aborts a run still waiting for the Host's terminal channel or Transport.
 */
export type TerminalSessionRunner = (
  request: TerminalAttachRequest,
  handler: TerminalSessionHandler,
  signal: CancelSignal,
) => Promise<void>;

/** The channel operations an attach pump needs; an SSH PTY stream satisfies it. */
export interface AttachChannel {
  write(data: Uint8Array): Promise<void>;
  resize(cols: number, rows: number): Promise<void>;
  onData(listener: (data: Uint8Array) => void): () => void;
  /** Fires once; a reason when the stream failed, none for an orderly end. */
  onClose(listener: (reason?: string) => void): () => void;
  /** The remote command's exit status once the channel closed by itself. */
  readonly exitStatus: number | undefined;
  close(): Promise<void>;
}
