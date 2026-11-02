import type { NativeSshBridge, StreamCloseEvent, StreamDataEvent } from './bridge';
import { fromBase64, toBase64 } from './bytes';
import { SshError, toSshError } from './errors';
import type { PtyStream, Unsubscribe } from './types';

const WRITE_TIMEOUT_MS = 15_000;

/**
 * Routes the module's stream events to stream objects. One native subscription per event
 * serves every stream; events for an id nobody holds are dropped.
 */
export class StreamRouter {
  private readonly streams = new Map<string, BridgeStream>();
  private subscribed = false;

  constructor(private readonly bridge: NativeSshBridge) {}

  open(id: string): BridgeStream {
    this.subscribe();
    const stream = new BridgeStream(id, this.bridge, () => this.streams.delete(id));
    this.streams.set(id, stream);
    return stream;
  }

  private subscribe() {
    if (this.subscribed) return;
    this.subscribed = true;
    this.bridge.addListener('onStreamData', (event: StreamDataEvent) => {
      this.streams.get(event.streamId)?.receive(fromBase64(event.data));
    });
    this.bridge.addListener('onStreamClose', (event: StreamCloseEvent) => {
      this.streams.get(event.streamId)?.ended(event.reason ?? undefined, event.exitStatus);
    });
  }
}

/** A stream over the bridge; also a PTY stream (resize fails on other kinds). */
export class BridgeStream implements PtyStream {
  private readonly dataListeners = new Set<(data: Uint8Array) => void>();
  private readonly closeListeners = new Set<(reason?: string) => void>();
  private started = false;
  private closed = false;
  private closeReason: string | undefined;
  exitStatus: number | undefined;

  constructor(
    readonly id: string,
    private readonly bridge: NativeSshBridge,
    private readonly forget: () => void,
  ) {}

  async write(data: Uint8Array) {
    if (this.closed) throw new SshError('closed', 'stream closed');
    try {
      await this.bridge.writeStream(this.id, toBase64(data), WRITE_TIMEOUT_MS);
    } catch (error) {
      throw toSshError(error);
    }
  }

  async resize(cols: number, rows: number) {
    try {
      await this.bridge.resizePty(this.id, cols, rows, WRITE_TIMEOUT_MS);
    } catch (error) {
      throw toSshError(error);
    }
  }

  onData(listener: (data: Uint8Array) => void): Unsubscribe {
    this.dataListeners.add(listener);
    if (!this.started && !this.closed) {
      this.started = true;
      this.bridge.startStream(this.id).catch((error) => this.ended(toSshError(error).code));
    }
    return () => this.dataListeners.delete(listener);
  }

  onClose(listener: (reason?: string) => void): Unsubscribe {
    if (this.closed) {
      listener(this.closeReason);
      return () => {};
    }
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  async close() {
    if (this.closed) return;
    await this.bridge.closeStream(this.id);
    this.ended(undefined, null);
  }

  /** Bytes from the remote side. */
  receive(data: Uint8Array) {
    if (this.closed) return;
    for (const listener of this.dataListeners) listener(data);
  }

  /** The native side closed the stream (EOF, failure, close, disconnect). Idempotent. */
  ended(reason: string | undefined, exitStatus?: number | null) {
    if (this.closed) return;
    this.closed = true;
    this.closeReason = reason;
    if (exitStatus !== null && exitStatus !== undefined) this.exitStatus = exitStatus;
    this.forget();
    for (const listener of this.closeListeners) listener(reason);
    this.closeListeners.clear();
    this.dataListeners.clear();
  }
}
