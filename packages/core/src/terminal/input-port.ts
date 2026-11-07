/** Identifies one live session's claim on the input path, so a stale session cannot end a newer one. */
export type InputSessionGeneration = number;

/**
 * What the attach store needs from the terminal input layer (Swift `TerminalInputController`,
 * whose keyboard and paste rules arrive with P3.2): a writer bound for each live session, and
 * the moments the session starts, goes live and ends.
 */
export interface TerminalInputPort {
  beginSession(writer: {
    write(data: Uint8Array): void;
    scroll(sequence: Uint8Array, rows: number): void;
  }): InputSessionGeneration;
  sessionDidBecomeLive(generation: InputSessionGeneration): void;
  endSession(
    generation: InputSessionGeneration,
    options?: { preservingPendingPaste?: boolean },
  ): void;
  /** Keystrokes from the view; dropped while no session is live. */
  send(data: Uint8Array): void;
  /** Touch scrolling, lossy: the session coalesces and sheds it. */
  scroll(sequence: Uint8Array, rows: number): void;
}

/** The plain input path: forwards to the live writer, drops otherwise. */
export class PlainTerminalInput implements TerminalInputPort {
  private generation = 0;
  private writer: {
    write(data: Uint8Array): void;
    scroll(sequence: Uint8Array, rows: number): void;
  } | null = null;
  private live = false;

  /** `didSend` sees each keystroke write, for whatever a key should interrupt. */
  constructor(private readonly didSend?: () => void) {}

  beginSession(writer: {
    write(data: Uint8Array): void;
    scroll(sequence: Uint8Array, rows: number): void;
  }): InputSessionGeneration {
    this.generation += 1;
    this.writer = writer;
    this.live = false;
    return this.generation;
  }

  sessionDidBecomeLive(generation: InputSessionGeneration): void {
    if (generation === this.generation) this.live = true;
  }

  endSession(generation: InputSessionGeneration): void {
    if (generation !== this.generation) return;
    this.writer = null;
    this.live = false;
  }

  send(data: Uint8Array): void {
    this.didSend?.();
    if (this.writer) this.writer.write(data);
  }

  scroll(sequence: Uint8Array, rows: number): void {
    if (rows > 0) this.writer?.scroll(sequence, rows);
  }

  get isLive(): boolean {
    return this.live;
  }
}
