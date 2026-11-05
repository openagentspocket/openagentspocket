import type { EventsSessionStatus } from '../events/types';

/**
 * How a Host's link reads to a person, one answer for every view that shows it:
 * - `connecting`: the first connection, not up yet;
 * - `live`: connected;
 * - `resuming`: it was connected and is suspended or re-dialing (background, a dropped socket):
 *   the last known good state still stands, so it keeps reading as connected;
 * - `offline`: a confirmed failure (never connected and failing, recovery stopped, or repeated dials).
 */
export type HostLink = 'connecting' | 'live' | 'resuming' | 'offline';

/** Failed dials of a once-connected Host that still count as resuming; the next one is confirmed. */
export const RESUME_ATTEMPTS = 2;

export function hostLink(status: EventsSessionStatus | undefined, wasConnected: boolean): HostLink {
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
