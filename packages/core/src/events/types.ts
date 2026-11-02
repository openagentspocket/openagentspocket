import type { TransportError } from '../errors/transport-error';
import type { EventSubscription, GlobalEventKind, HerdrEvent, PaneEventKind } from '../wire';

export const globalSubscription = (kind: GlobalEventKind): EventSubscription => ({
  kind,
});

export const paneSubscription = (kind: PaneEventKind, paneId: string): EventSubscription => ({
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
    return !!other && entry.kind === other.kind && entry.paneId === other.paneId;
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
    (entry) => entry.paneId === undefined && entry.kind !== 'workspace.reordered',
  );
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
      readonly failure: TransportError;
    }
  /** Recovery stopped: retrying cannot fix this without the user. */
  | { readonly kind: 'failed'; readonly failure: TransportError }
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
