import { describe, expect, it } from 'vitest';
import { type AgentPanelSort, rowSortKey, type SortKey, sortBucket, sortConsole } from './ordering';

const item = (over: Partial<SortKey> & { paneId: string }): SortKey => ({
  hostId: 'h1',
  hostName: 'alpha',
  status: 'idle',
  workspaceLabel: 'Proj',
  ...over,
});
const panes = (items: SortKey[]) => items.map((entry) => entry.paneId);
const sorted = (
  items: SortKey[],
  options: Parameters<typeof sortConsole<SortKey>>[2] = {},
): string[] => panes(sortConsole(items, (entry) => entry, options));

describe('sortBucket', () => {
  it('ranks blocked, done, working, idle, then everything else', () => {
    const buckets = ['blocked', 'done', 'working', 'idle', 'unknown'].map(sortBucket);
    expect(buckets).toEqual([...buckets].sort((a, b) => a - b));
    expect(new Set(buckets).size).toBe(5);
  });

  it('puts a status this build does not know in the bottom bucket, not on top', () => {
    expect(sortBucket('haunted')).toBe(sortBucket('unknown'));
  });
});

describe('sortConsole', () => {
  const idle = item({ paneId: 'w1:p1', status: 'idle' });
  const working = item({ paneId: 'w1:p2', status: 'working' });
  const blocked = item({ paneId: 'w2:p1', status: 'blocked', hostId: 'h2', hostName: 'beta' });
  const done = item({ paneId: 'w2:p2', status: 'done', hostId: 'h2', hostName: 'beta' });
  const all = [idle, working, blocked, done];

  it('orders by status bucket across Hosts', () => {
    expect(sorted(all)).toEqual(['w2:p1', 'w2:p2', 'w1:p2', 'w1:p1']);
  });

  it('puts pinned items first, by rank, keeping the unpinned order', () => {
    const ranks = new Map([
      [idle.paneId, 1],
      [working.paneId, 0],
    ]);
    expect(sorted(all, { pinRank: (entry) => ranks.get(entry.paneId) })).toEqual([
      'w1:p2',
      'w1:p1',
      'w2:p1',
      'w2:p2',
    ]);
  });

  it('breaks same-status ties by Host name, Host id, workspace, then pane id', () => {
    const later = item({ paneId: 'w1:p1', status: 'working', hostName: 'zeta' });
    const earlier = item({ paneId: 'w2:p1', status: 'working', hostId: 'h2' });
    expect(sorted([later, earlier])).toEqual(['w2:p1', 'w1:p1']);
    const ranks = new Map([[later.paneId, 0]]);
    expect(sorted([later, earlier], { pinRank: (entry) => ranks.get(entry.paneId) })).toEqual([
      'w1:p1',
      'w2:p1',
    ]);
    const sameHostA = item({ paneId: 'p2', workspaceLabel: 'A' });
    const sameHostB = item({ paneId: 'p1', workspaceLabel: 'B' });
    const sameWorkspace = item({ paneId: 'p0', workspaceLabel: 'B' });
    expect(sorted([sameHostB, sameWorkspace, sameHostA])).toEqual(['p2', 'p0', 'p1']);
  });

  it('puts the newest state change first within one Host and status', () => {
    const old = item({ paneId: 'old', stateChangeSeq: 1 });
    const fresh = item({ paneId: 'new', stateChangeSeq: 5 });
    expect(sorted([old, fresh])).toEqual(['new', 'old']);
  });

  it('does not mutate its input', () => {
    const input = [idle, blocked];
    sortConsole(input, (entry) => entry);
    expect(input[0]).toBe(idle);
  });

  it('uses herdr order for a Host on spaces and ignores state changes there', () => {
    const sorts = new Map<string, AgentPanelSort>([['h1', 'spaces']]);
    const first = item({ paneId: 'first', status: 'idle', snapshotOrder: 0, stateChangeSeq: 1 });
    const second = item({
      paneId: 'second',
      status: 'blocked',
      snapshotOrder: 1,
      stateChangeSeq: 9,
    });
    expect(sorted([second, first], { sortByHost: sorts })).toEqual(['first', 'second']);
  });

  it('compares Hosts first when any Host uses space order, so mixed Hosts stay transitive', () => {
    const sorts = new Map<string, AgentPanelSort>([['h2', 'spaces']]);
    const a = item({ paneId: 'a', hostId: 'h1', hostName: 'alpha', status: 'idle' });
    const b = item({ paneId: 'b', hostId: 'h2', hostName: 'beta', status: 'blocked' });
    const c = item({ paneId: 'c', hostId: 'h1', hostName: 'alpha', status: 'blocked' });
    expect(sorted([b, a, c], { sortByHost: sorts })).toEqual(['c', 'a', 'b']);
  });
});

describe('rowSortKey', () => {
  it('reads the wire status and sequence of a row', () => {
    const key = rowSortKey({
      hostId: 'h',
      hostName: 'n',
      agent: { agent_status: 'done', state_change_seq: 4, pane_id: 'p' },
      snapshotOrder: 2,
    });
    expect(key).toMatchObject({ status: 'done', stateChangeSeq: 4, paneId: 'p', snapshotOrder: 2 });
  });
});
