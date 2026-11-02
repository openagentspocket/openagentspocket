import type { Clock } from '../hosts/cancellation';
import type { EventSubscription, HerdrEventStream } from '../wire';
import type { KeepalivePolicy, ReconnectPolicy } from './policies';
import type { PingInfo } from './protocol';

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
  /** Test hook: a terminal caller parked waiting for a Transport. */
  readonly onTerminalWaiterRegistered?: () => void;
}
