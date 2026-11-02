import { asTransportError } from '@openagentspocket/core';
import type { HostSummary } from '@/console/store';
import { DONE_CAP, homeContent, hostState, WORKING_CAP } from './homeModel';

const items = (count: number) => Array.from({ length: count }, (_, index) => index);

const host = (status: HostSummary['status'], isAwaitingSnapshot = false): HostSummary => ({
  id: 'h',
  name: 'h',
  status,
  isAwaitingSnapshot,
  syncError: undefined,
  latencyMs: undefined,
});

describe('homeContent', () => {
  it('keeps Needs you whole and caps Working and Done', () => {
    const content = homeContent(
      { needsYou: items(9), working: items(10), doneRecent: items(10), idle: items(2) },
      [host({ kind: 'connected' })],
    );
    const by = Object.fromEntries(content.sections.map((s) => [s.section, s]));
    expect(by.needsYou?.items).toHaveLength(9);
    expect(by.working?.items).toHaveLength(WORKING_CAP);
    expect(by.working?.total).toBe(10);
    expect(by.doneRecent?.items).toHaveLength(DONE_CAP);
    expect(content.idleCount).toBe(2);
    expect(content.isQuiet).toBe(false);
  });

  it('is quiet when only idle Agents exist, and loading while a Host has no snapshot', () => {
    const quiet = homeContent({ idle: items(1) }, [host({ kind: 'connected' })]);
    expect(quiet.isQuiet).toBe(true);
    expect(quiet.isLoading).toBe(false);
    expect(homeContent({}, [host({ kind: 'connecting' })]).isLoading).toBe(true);
  });

  it('reports unreachable Hosts', () => {
    const failure = asTransportError(new Error('x'));
    expect(hostState(host({ kind: 'failed', failure }))).toBe('offline');
    expect(hostState(host({ kind: 'suspended' }))).toBe('offline');
    expect(hostState(host({ kind: 'connected' }, true))).toBe('loading');
    expect(hostState(host({ kind: 'connected' }))).toBe('live');
  });
});
