import type { EventsSessionStatus } from '../events/types';

/**
 * How a Host's link reads to a person, one answer for every view that shows it:
 * - `connecting`: the first connection, not up yet;
 * - `live`: connected;
 * - `resuming`: it was connected and is suspended or re-dialing (background, a dropped socket):
 *   the last known good state still stands, so it keeps reading as connected;
 * - `stopped`: the user tapped Stop Connecting: their decision, shown as stopped with a Connect action;
 * - `offline`: a confirmed failure (never connected and failing, recovery stopped, or repeated dials).
 */
export type HostLink = 'connecting' | 'live' | 'resuming' | 'stopped' | 'offline';

/** Failed dials of a once-connected Host that still count as resuming; the next one is confirmed. */
export const RESUME_ATTEMPTS = 2;

/**
 * Past this a keystroke's echo visibly trails the finger, on a link that is otherwise up. Latency is
 * herdr's own `ping` round trip, so a healthy cellular link sits well under it.
 */
export const SLOW_LINK_MS = 500;

/** What an Agent's screen says about its link: nothing while it is fine. */
export type LinkNote = { readonly kind: 'lost' } | { readonly kind: 'slow'; readonly ms: number };

/** `stale`: the rows are from an earlier snapshot, the Host is reconnecting. */
export function linkNote(stale: boolean, latencyMs: number | undefined): LinkNote | null {
  if (stale) return { kind: 'lost' };
  return latencyMs !== undefined && latencyMs >= SLOW_LINK_MS
    ? { kind: 'slow', ms: latencyMs }
    : null;
}

export function hostLink(
  status: EventsSessionStatus | undefined,
  wasConnected: boolean,
  stoppedByUser = false,
): HostLink {
  if (stoppedByUser && status?.kind === 'suspended') return 'stopped';
  switch (status?.kind) {
    case 'connected':
      return 'live';
    case undefined:
    case 'connecting':
    case 'suspended':
      return wasConnected ? 'resuming' : 'connecting';
    case 'reconnecting':
      return wasConnected && status.attempt <= RESUME_ATTEMPTS ? 'resuming' : 'offline';
    default:
      return 'offline';
  }
}
