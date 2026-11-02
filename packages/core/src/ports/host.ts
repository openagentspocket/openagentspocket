import type { TransportError } from '../errors/transport-error';
import { parsePort } from './address';
import type { ForwardTarget, ListeningPortReport } from './types';

/** Where a started tunnel listens on the phone. */
export interface TunnelEndpoint {
  /** `http://127.0.0.1:<localPort>/`, what the web view loads. */
  readonly url: string;
  readonly localPort: number;
}

/** A browser preview tunnel as the store drives it: a session forward in the app, a double in tests. */
export interface PortPreviewTunnel {
  /** Listens, or returns the endpoint it already listens on. */
  start(): Promise<TunnelEndpoint>;
  /** Stops listening and closes every channel. */
  stop(): Promise<void>;
  /**
   * The latest channel open that failed (nothing answered, forwarding refused); null when the
   * tunnel has no failure to report. Cleared by `start`.
   */
  lastFailure(): Promise<TransportError | null>;
}

/**
 * What the Ports screens need from one Host, so the store stays off the SSH types and tests can
 * script a Host and its tunnels.
 */
export interface PortPreviewHost {
  listListeningPorts(): Promise<ListeningPortReport>;
  /** A stopped tunnel to `target`; the store starts and stops it. */
  makeTunnel(target: ForwardTarget): PortPreviewTunnel;
  /** Drops the connection under every tunnel; the next call dials again (background past grace). */
  disconnect(): Promise<void>;
  /** Ends the connection for good, when the screens close. */
  close(): Promise<void>;
}

/** The port a user typed, or null unless it is a whole number in 1...65535. */
export function manualPort(text: string): number | null {
  return parsePort(text.trim());
}
