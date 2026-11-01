import type { Clock } from './clock';
import type { FailureModel } from './failure';
import type { KeepalivePolicy, ReconnectPolicy } from './policies';
import type { PingInfo } from './protocol';
import type { EventSubscription, HerdrEventStream } from './types';

/** What the events session needs from a Host's Transport. */
export interface EventsTransport {
  /** herdr `ping`; the session applies the protocol floor to its answer. */
  ping(): Promise<PingInfo>;
  /** Opens the Host's one events channel; resolves once herdr acknowledged it. */
  subscribeToEvents(subscriptions: readonly EventSubscription[]): Promise<HerdrEventStream>;
  /** Whether the SSH connection still looks alive. */
  isConnected(): boolean | Promise<boolean>;
  close(): Promise<void>;
  /** The catalog route this connection reached, when known. */
  readonly routeId?: string;
}

export interface EventsSessionOptions<T extends EventsTransport> {
  readonly subscriptions: readonly EventSubscription[];
  /** Dials and authenticates a fresh Transport. */
  readonly connect: () => Promise<T>;
  readonly clock: Clock;
  readonly reconnect?: ReconnectPolicy;
  /** `null` disables the keepalive. */
  readonly keepalive?: KeepalivePolicy | null;
  readonly updatesBufferLimit?: number;
  readonly failureModel?: FailureModel;
  /** Test hook: a terminal caller parked waiting for a Transport. */
  readonly onTerminalWaiterRegistered?: () => void;
}
