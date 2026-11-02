import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../hosts/known-hosts';
import { agentKey, type ConsoleRow } from './row';
import { AgentStatusClocks, STAMP_RETENTION_MS } from './status-clocks';
import { firstSeen, observing, reconciled } from './status-stamp';
import { agentInfo } from './testing';

const NOW = 1_000_000_000_000;

const row = (hostId: string, paneId: string, status: string, seq?: number): ConsoleRow => ({
  hostId,
  hostName: hostId,
  workspaceTabCount: 1,
  tabPaneCount: 1,
  agent: agentInfo(paneId, status, { state_change_seq: seq }),
});

describe('status stamps', () => {
  it('starts approximate on first sight', () => {
    const stamp = firstSeen(agentInfo('p', 'working'), NOW);
    expect(stamp).toMatchObject({
      status: 'working',
      since: NOW,
      isApproximate: true,
      dismissed: false,
    });
  });

  it('records a seen transition exactly, and Idle after work as work ended', () => {
    const working = firstSeen(agentInfo('p', 'working'), NOW);
    const idle = observing(working, agentInfo('p', 'idle'), NOW + 5000);
    expect(idle).toMatchObject({
      status: 'idle',
      previousStatus: 'working',
      since: NOW + 5000,
      isApproximate: false,
      lastWorkEndedAt: NOW + 5000,
    });
    const blocked = observing(idle, agentInfo('p', 'blocked'), NOW + 6000);
    expect(blocked.lastWorkEndedAt).toBe(NOW + 5000); // only Idle moves it
  });

  it('keeps a Clear when opening a Done Agent turns it Idle, and revives it on new work', () => {
    const done = { ...firstSeen(agentInfo('p', 'done'), NOW), dismissed: true };
    expect(observing(done, agentInfo('p', 'idle'), NOW + 1).dismissed).toBe(true);
    expect(observing(done, agentInfo('p', 'working'), NOW + 1).dismissed).toBe(false);
  });

  it('starts over when the pane now hosts another terminal', () => {
    const old = firstSeen(agentInfo('p', 'working'), NOW);
    const reused = observing(old, agentInfo('p', 'working', { terminal_id: 'other' }), NOW + 9);
    expect(reused).toMatchObject({ terminalId: 'other', since: NOW + 9, isApproximate: true });
  });

  it('ignores the sequence that came with a transition it already counted', () => {
    const working = firstSeen(agentInfo('p', 'working', { state_change_seq: 1 }), NOW);
    const idle = observing(working, agentInfo('p', 'idle', { state_change_seq: 2 }), NOW + 1);
    expect(observing(idle, agentInfo('p', 'idle', { state_change_seq: 2 }), NOW + 2)).toBe(idle);
  });

  it('reconciles a gap as an approximate change and Idle as unseen work ended', () => {
    const working = firstSeen(agentInfo('p', 'working'), NOW);
    const after = reconciled(working, agentInfo('p', 'idle'), NOW + 9000);
    expect(after).toMatchObject({
      status: 'idle',
      since: NOW + 9000,
      isApproximate: true,
      lastWorkEndedAt: NOW + 9000,
    });
    expect(reconciled(working, agentInfo('p', 'working'), NOW + 9000).since).toBe(NOW);
  });
});

describe('AgentStatusClocks', () => {
  const key = agentKey('h', 'p1');

  it('stamps new Agents, observes changes, and persists across instances', () => {
    const storage = new MemoryStorage();
    let now = NOW;
    const clocks = new AgentStatusClocks(storage, () => now);
    clocks.agentsDidChange([row('h', 'p1', 'working')], new Set(['h']));
    expect(clocks.stamp(key)?.isApproximate).toBe(true);
    now += 5000;
    clocks.agentsDidChange([row('h', 'p1', 'idle')], new Set(['h']));
    expect(clocks.stamp(key)).toMatchObject({ status: 'idle', isApproximate: false });

    const reloaded = new AgentStatusClocks(storage, () => now);
    expect(reloaded.stamp(key)?.status).toBe('idle');
  });

  it('drops an Agent that vanished from a ready Host, but not from one that is away', () => {
    const clocks = new AgentStatusClocks(new MemoryStorage(), () => NOW);
    clocks.agentsDidChange([row('h', 'p1', 'working')], new Set(['h']));
    clocks.agentsDidChange([], new Set());
    expect(clocks.stamp(key)).toBeDefined();
    clocks.agentsDidChange([], new Set(['h']));
    expect(clocks.stamp(key)).toBeUndefined();
  });

  it('reconciles instead of observing after a Host was away', () => {
    let now = NOW;
    const clocks = new AgentStatusClocks(new MemoryStorage(), () => now);
    clocks.agentsDidChange([row('h', 'p1', 'working')], new Set(['h']));
    clocks.agentsDidChange([], new Set()); // the Host drops
    now += 60_000;
    clocks.agentsDidChange([row('h', 'p1', 'idle')], new Set(['h']));
    expect(clocks.stamp(key)).toMatchObject({ status: 'idle', isApproximate: true });
  });

  it('reconciles stamps loaded from storage on the first ready snapshot', () => {
    const storage = new MemoryStorage();
    const first = new AgentStatusClocks(storage, () => NOW);
    first.agentsDidChange([row('h', 'p1', 'working')], new Set(['h']));
    const second = new AgentStatusClocks(storage, () => NOW + 1000);
    second.agentsDidChange([row('h', 'p1', 'done')], new Set(['h']));
    expect(second.stamp(key)).toMatchObject({ status: 'done', isApproximate: true });
  });

  it('forgets stamps older than the retention, dismisses, and retains only listed Hosts', () => {
    const storage = new MemoryStorage();
    const early = new AgentStatusClocks(storage, () => NOW);
    early.agentsDidChange([row('h', 'p1', 'done'), row('g', 'p1', 'done')], new Set(['h', 'g']));
    early.dismiss(key);
    expect(early.stamp(key)?.dismissed).toBe(true);
    early.retainHosts(new Set(['h']));
    expect(early.stamp(agentKey('g', 'p1'))).toBeUndefined();

    const late = new AgentStatusClocks(storage, () => NOW + STAMP_RETENTION_MS + 1);
    expect(late.stamp(key)).toBeUndefined();
  });

  it('starts empty on malformed or unknown-version data', () => {
    const storage = new MemoryStorage();
    storage.set('status-inbox.stamps', '{oops');
    expect(new AgentStatusClocks(storage, () => NOW).stamp(key)).toBeUndefined();
    storage.set('status-inbox.stamps', JSON.stringify({ version: 7, entries: [] }));
    expect(new AgentStatusClocks(storage, () => NOW).stamp(key)).toBeUndefined();
  });
});
