/** Where a feed's bytes land: a terminal view's write path. */
export interface ByteSink {
  write(bytes: Uint8Array): void;
}

/**
 * The byte pipe between a session and the terminal view that renders it. Bytes written before
 * any view is attached are held for the first one (the PTY paints before the surface exists); a
 * live sink gets them as they come; bytes written after the sink is gone are not replayed to the
 * next one, which repaints from the remote. Empty chunks never reach the sink.
 * (Swift `TerminalByteFeed`.)
 */
export class TerminalByteFeed {
  private sink: ByteSink | null = null;
  private held: Uint8Array[] = [];
  private everHadSink = false;

  write(bytes: Uint8Array): void {
    if (bytes.length === 0) return;
    if (this.sink) this.sink.write(bytes);
    else if (!this.everHadSink) this.held.push(bytes);
  }

  /** Attaches a view; what was held for the first one is delivered now. Returns the release. */
  acquire(sink: ByteSink): () => void {
    this.sink = sink;
    this.everHadSink = true;
    const held = this.held;
    this.held = [];
    for (const bytes of held) sink.write(bytes);
    return () => {
      if (this.sink === sink) this.sink = null;
    };
  }
}
