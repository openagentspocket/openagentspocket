import type { Subscription } from '../protocol/herdr-types.generated';
import type { TransportFailure } from './failure';

/**
 * Host-wide subscription kinds, subscribed with no params, in herdr's
 * canonical dotted spelling. `workspace.reordered` needs protocol 19: only
 * subscribe once the current connection's snapshot reports it.
 */
export const GLOBAL_EVENT_KINDS = [
  'workspace.created',
  'workspace.updated',
  'workspace.metadata_updated',
  'workspace.renamed',
  'workspace.moved',
  'workspace.reordered',
  'workspace.closed',
  'workspace.focused',
  'worktree.created',
  'worktree.opened',
  'worktree.removed',
  'tab.created',
  'tab.closed',
  'tab.focused',
  'tab.renamed',
  'tab.moved',
  'pane.created',
  'pane.closed',
  'pane.updated',
  'pane.focused',
  'pane.moved',
  'pane.exited',
  'pane.agent_detected',
  'layout.updated',
] as const satisfies readonly Subscription['type'][];
export type GlobalEventKind = (typeof GLOBAL_EVENT_KINDS)[number];

/** Pane-scoped kinds: their subscriptions carry a `pane_id`. */
export const PANE_EVENT_KINDS = [
  'pane.agent_status_changed',
  'pane.scroll_changed',
] as const satisfies readonly Subscription['type'][];
export type PaneEventKind = (typeof PANE_EVENT_KINDS)[number];

/**
 * `pane.output_matched` needs a full output-match query to subscribe; it is
 * not subscribed here, but its events still decode to the canonical kind.
 */
export const PANE_OUTPUT_MATCHED = 'pane.output_matched';

/** One entry of an `events.subscribe` request. */
export type EventSubscription =
  | { readonly scope: 'global'; readonly kind: GlobalEventKind }
  | { readonly scope: 'pane'; readonly kind: PaneEventKind; readonly paneId: string };

export const globalSubscription = (kind: GlobalEventKind): EventSubscription => ({
  scope: 'global',
  kind,
});

export const paneSubscription = (kind: PaneEventKind, paneId: string): EventSubscription => ({
  scope: 'pane',
  kind,
  paneId,
});

export function sameSubscriptions(
  a: readonly EventSubscription[],
  b: readonly EventSubscription[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, index) => {
    const other = b[index];
    if (!other || entry.scope !== other.scope || entry.kind !== other.kind) return false;
    return entry.scope === 'global' || (other.scope === 'pane' && entry.paneId === other.paneId);
  });
}

/**
 * Keeps only the baseline global kinds. Pane entries come from a snapshot,
 * and herdr rejects a whole `events.subscribe` when one names an exited pane,
 * so they never survive a disconnect; `workspace.reordered` must be proven
 * (protocol 19) again by the new connection's snapshot.
 */
export function baselineSubscriptions(
  subscriptions: readonly EventSubscription[],
): EventSubscription[] {
  return subscriptions.filter(
    (entry) => entry.scope === 'global' && entry.kind !== 'workspace.reordered',
  );
}

/**
 * One event from the Host's events channel. `kind` is canonical (dotted);
 * `data` stays schema-free: consumers pick the fields they know.
 */
export interface HerdrEvent {
  readonly kind: string;
  readonly data: unknown;
}

/**
 * Synthetic, local-only kind: stands in for updates a bounded buffer shed.
 * Never sent by herdr, never subscribable. Consumers re-snapshot on it,
 * because deltas may be missing.
 */
export const EVENTS_DROPPED_KIND = 'local.events_dropped';
export const EVENTS_DROPPED: HerdrEvent = { kind: EVENTS_DROPPED_KIND, data: null };

const KNOWN_KINDS: readonly string[] = [
  ...GLOBAL_EVENT_KINDS,
  ...PANE_EVENT_KINDS,
  PANE_OUTPUT_MATCHED,
];
const BY_WIRE_NAME = new Map<string, string>(
  KNOWN_KINDS.flatMap((kind) => [
    [kind, kind],
    [kind.replaceAll('.', '_'), kind],
  ]),
);

/**
 * Maps a wire spelling (event lines arrive snake_case, subscriptions are
 * dotted) onto the canonical kind. Unknown names pass through untouched: an
 * unknown kind must never be guess-mangled or kill the stream.
 */
export function canonicalEventKind(wireName: string): string {
  return BY_WIRE_NAME.get(wireName) ?? wireName;
}

/** Where the events session stands; the UI derives staleness from this. */
export type EventsSessionStatus =
  /** A new activation is establishing its first events path. */
  | { readonly kind: 'connecting' }
  /** The subscription was acknowledged: every one obliges a fresh snapshot. */
  | { readonly kind: 'connected' }
  /** Automatic recovery: the announced backoff and the dial that follows. */
  | {
      readonly kind: 'reconnecting';
      readonly attempt: number;
      readonly delayMs: number;
      readonly failure: TransportFailure;
    }
  /** Recovery stopped: retrying cannot fix this without the user. */
  | { readonly kind: 'failed'; readonly failure: TransportFailure }
  /** Deliberately torn down (background grace elapsed) until `resume()`. */
  | { readonly kind: 'suspended' }
  /** `end()` was called: terminal. */
  | { readonly kind: 'ended' };

/** Status transitions and events, interleaved in the order they happened. */
export type EventsSessionUpdate =
  | { readonly type: 'status'; readonly status: EventsSessionStatus }
  | { readonly type: 'event'; readonly event: HerdrEvent };

export const statusUpdate = (status: EventsSessionStatus): EventsSessionUpdate => ({
  type: 'status',
  status,
});

export const eventUpdate = (event: HerdrEvent): EventsSessionUpdate => ({ type: 'event', event });

/**
 * A live `events.subscribe` stream over its Host's dedicated channel.
 * `events` finishes cleanly after `end()` and rejects when the channel dies
 * remotely. Single consumer.
 */
export interface HerdrEventStream {
  readonly events: AsyncIterable<HerdrEvent>;
  /** Closes the channel explicitly and waits for its teardown. Idempotent. */
  end(): Promise<void>;
}
