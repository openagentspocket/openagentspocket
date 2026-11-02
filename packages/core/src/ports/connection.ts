import { TransportFailure } from '../errors/transport-error';

/** The part of an SSH session the preview's connection manages. */
export interface PreviewSession {
  isConnected(): Promise<boolean>;
  disconnect(): Promise<void>;
}

/**
 * The browser preview's own SSH connection: a second session to the Host that carries the port
 * discovery and every tunnel, so a page that stalls a channel can never take the Console's
 * Events or Attach down with it.
 *
 * Dialled on first use and again whenever the previous session reports it lost the link (the app
 * came back from the background). `disconnect` drops the session and keeps the object usable;
 * `close` ends it for good.
 */
export class PreviewConnection<Session extends PreviewSession> {
  private current: { session: Session; generation: number } | null = null;
  private dialing: { promise: Promise<Session>; generation: number } | null = null;
  private generation = 0;
  private closed = false;

  /** `dial` makes one session per call; credentials resolve inside it, when the preview really dials. */
  constructor(private readonly dial: () => Promise<Session>) {}

  /** The live session. Concurrent callers share one dial. */
  async session(): Promise<Session> {
    if (this.closed) throw new TransportFailure({ kind: 'cancelled' });
    const known = this.current;
    if (known) {
      if (await known.session.isConnected().catch(() => false)) return known.session;
      if (this.current?.generation === known.generation) {
        this.current = null;
        void known.session.disconnect().catch(() => undefined);
      }
    }
    if (this.current) return this.current.session;
    if (this.dialing) return this.dialing.promise;
    this.generation += 1;
    const attempt = this.generation;
    const promise = this.dial();
    this.dialing = { promise, generation: attempt };
    try {
      const fresh = await promise;
      if (this.dialing?.generation === attempt) this.dialing = null;
      if (this.closed || this.generation !== attempt) {
        await fresh.disconnect().catch(() => undefined);
        throw new TransportFailure({ kind: 'cancelled' });
      }
      this.current = { session: fresh, generation: attempt };
      return fresh;
    } catch (thrown) {
      if (this.dialing?.generation === attempt) this.dialing = null;
      throw thrown;
    }
  }

  /** Closes the session, ending every channel on it; the next use dials again. */
  async disconnect(): Promise<void> {
    this.generation += 1;
    this.dialing = null;
    const session = this.current?.session;
    this.current = null;
    await session?.disconnect().catch(() => undefined);
  }

  /** Disconnects for good: later calls throw `cancelled`. */
  async close(): Promise<void> {
    this.closed = true;
    await this.disconnect();
  }
}
