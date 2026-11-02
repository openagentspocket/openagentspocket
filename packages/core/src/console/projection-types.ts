import { asTransportError } from '../errors/transport-error';
import type { EventsSessionUpdate } from '../events/types';
import type { CancelSignal, Clock } from '../hosts/cancellation';
import type * as herdr from '../protocol/herdr-types.generated';
import { type EventSubscription, isJsonObject, type JsonValue } from '../wire';
import type { HostIdentity } from './snapshot-rows';

/** The RPCs one Host's Console needs from its Transport. */
export interface ConsoleTransport {
  sessionSnapshot(): Promise<herdr.SessionSnapshot>;
  readPane(params: {
    paneId: string;
    source: 'recent';
    lines: number;
    stripAnsi: boolean;
  }): Promise<{ text: string }>;
}

/** What the projection uses of an `EventsSession`; the real session satisfies it. */
export interface ConsoleSession<T extends ConsoleTransport> {
  readonly updates: AsyncIterable<EventsSessionUpdate>;
  readonly latencyUpdates: AsyncIterable<number>;
  readonly terminalTransportGenerations: AsyncIterable<number>;
  readonly currentLatency: number | undefined;
  readonly currentRouteId: string | undefined;
  withTransport<V>(operation: (transport: T) => Promise<V>): Promise<V>;
  /** One terminal lifetime on the ping-proven Transport (the real session; fakes may omit it). */
  withTerminalTransport?<V>(
    operation: (transport: T, transportGeneration: number) => Promise<V>,
    options?: { target?: string | null; signal?: CancelSignal },
  ): Promise<V>;
  updateSubscriptions(subscriptions: readonly EventSubscription[]): Promise<void>;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  retry(): Promise<void>;
  revalidate(): Promise<void>;
  cancelConnecting(): Promise<void>;
  end(): Promise<void>;
}

/** Why the last sync failed; the UI picks the words. */
export type SyncError =
  | { readonly kind: 'timedOut' }
  | { readonly kind: 'rejected'; readonly message: string }
  | { readonly kind: 'failed' };

export interface HostConsoleProjectionOptions<T extends ConsoleTransport> {
  readonly host: HostIdentity;
  readonly session: ConsoleSession<T>;
  readonly clock: Clock;
  /** How long to wait before retrying a failed snapshot. */
  readonly snapshotRetryMs: number;
  readonly onChange: () => void;
}

export function syncErrorFor(error: unknown): SyncError {
  const failure = asTransportError(error);
  if (failure.kind === 'timedOut') return { kind: 'timedOut' };
  if (failure.kind === 'apiRejected') return { kind: 'rejected', message: failure.message };
  return { kind: 'failed' };
}

export function stringField(value: JsonValue, key: string): string | undefined {
  if (!isJsonObject(value)) return undefined;
  const field = value[key];
  return typeof field === 'string' ? field : undefined;
}

export function decodePane(data: JsonValue): herdr.PaneInfo | undefined {
  if (!isJsonObject(data)) return undefined;
  const pane = data.pane;
  if (!isJsonObject(pane)) return undefined;
  const required = ['pane_id', 'terminal_id', 'workspace_id', 'tab_id'];
  if (!required.every((key) => typeof pane[key] === 'string')) return undefined;
  return pane as unknown as herdr.PaneInfo;
}
