import { describe, expect, it } from 'vitest';
import { failures } from '../events/failure';
import { hostLink, RESUME_ATTEMPTS } from './host-link';

const reconnecting = (attempt: number) => ({
  kind: 'reconnecting' as const,
  attempt,
  delayMs: 1000,
  failure: failures.channelFailed('x'),
});

describe('hostLink', () => {
  it('says connecting only before the first connection', () => {
    expect(hostLink(undefined, false)).toBe('connecting');
    expect(hostLink({ kind: 'connecting' }, false)).toBe('connecting');
    expect(hostLink({ kind: 'suspended' }, false)).toBe('connecting');
  });

  it('keeps a once-connected Host reading as resuming while suspended or re-dialing', () => {
    expect(hostLink({ kind: 'suspended' }, true)).toBe('resuming');
    expect(hostLink({ kind: 'connecting' }, true)).toBe('resuming');
    expect(hostLink(reconnecting(1), true)).toBe('resuming');
    expect(hostLink({ kind: 'connected' }, true)).toBe('live');
  });

  it('is offline only after a confirmed failure', () => {
    expect(hostLink(reconnecting(RESUME_ATTEMPTS + 1), true)).toBe('offline');
    expect(hostLink(reconnecting(1), false)).toBe('offline');
    expect(hostLink({ kind: 'failed', failure: failures.channelFailed('x') }, true)).toBe(
      'offline',
    );
    expect(hostLink({ kind: 'ended' }, true)).toBe('offline');
  });
});
