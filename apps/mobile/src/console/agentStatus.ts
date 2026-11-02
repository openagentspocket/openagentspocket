import type { Status } from '@openagentspocket/ui';

/** The status dot for an agent's wire status; anything herdr adds later reads as idle. */
export function statusDot(status: string): Status {
  return status === 'blocked' || status === 'done' || status === 'working' ? status : 'idle';
}
