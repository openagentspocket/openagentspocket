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
      this.streams.get(event.streamId)?.receiveEncoded(event.data);
    });
    this.bridge.addListener('onStreamClose', (event: StreamCloseEvent) => {
      this.streams.get(event.streamId)?.ended(event.reason ?? undefined, event.exitStatus);
    });
  }
}

/** A stream over the bridge; also a PTY stream (resize fails on other kinds). */
export class BridgeStream implements PtyStream {
  private readonly dataListeners = new Set<(data: Uint8Array) => void>();
  private readonly encodedListeners = new Set<(base64: string) => void>();
  private readonly closeListeners = new Set<(reason?: string) => void>();
  private writeTail: Promise<void> = Promise.resolve();
  private started = false;
  private closed = false;
  private closeReason: string | undefined;
  exitStatus: number | undefined;

  constructor(
    readonly id: string,
    private readonly bridge: NativeSshBridge,
    private readonly forget: () => void,
  ) {}

  /**
   * Writes one after another: native async functions run concurrently, so two writes issued
   * back to back (fast typing, a paste) could otherwise reach the PTY out of order.
   */
  write(data: Uint8Array): Promise<void> {
    if (this.closed) return Promise.reject(new SshError('closed', 'stream closed'));
    const encoded = toBase64(data);
    const result = this.writeTail.then(async () => {
      try {
        await this.bridge.writeStream(this.id, encoded, WRITE_TIMEOUT_MS);
      } catch (error) {
        throw toSshError(error);
      }
    });
    this.writeTail = result.catch(() => {});
    return result;
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
    this.start();
    return () => this.dataListeners.delete(listener);
  }

  onEncodedData(listener: (base64: string) => void): Unsubscribe {
    this.encodedListeners.add(listener);
    this.start();
    return () => this.encodedListeners.delete(listener);
  }

  private start() {
    if (this.started || this.closed) return;
    this.started = true;
    this.bridge.startStream(this.id).catch((error) => this.ended(toSshError(error).code));
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

  /**
   * A chunk as it crossed the bridge. It is decoded only when a `onData` listener exists: base64
   * in Hermes costs about as much as the whole terminal, so a renderer that takes base64 skips it.
   */
  receiveEncoded(base64: string) {
    if (this.closed) return;
    for (const listener of this.encodedListeners) listener(base64);
    if (this.dataListeners.size) this.receive(fromBase64(base64));
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
    this.encodedListeners.clear();
  }
}
