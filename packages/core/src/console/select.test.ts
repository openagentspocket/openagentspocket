import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../hosts/known-hosts';
import { PinnedAgents } from './pins';
import type { ConsoleRow } from './row';
import { findRow, type HostRowsView, isHostReady, selectConsole } from './select';
import { groupForHome } from './select-home';
import { AgentStatusClocks } from './status-clocks';
import { agentInfo, testHost } from './testing';

const row = (hostId: string, paneId: string, status: string, seq = 0): ConsoleRow => ({
  hostId,
  hostName: hostId,
  agent: { ...agentInfo(paneId, 'idle'), agent_status: status, state_change_seq: seq },
  workspaceTabCount: 1,
  tabPaneCount: 1,
});

const view = (id: string, rows: ConsoleRow[], over: Partial<HostRowsView> = {}): HostRowsView => ({
  host: testHost({ id }),
  agentsByPane: new Map(rows.map((r) => [r.agent.pane_id, r])),
  status: { kind: 'connected' },
  isAwaitingSnapshot: false,
  ...over,
});

describe('selectConsole', () => {
  it('merges Hosts in Console order', () => {
    const { rows } = selectConsole({
      hosts: [
        view('b', [row('b', 'p1', 'working')]),
        view('a', [row('a', 'p1', 'idle'), row('a', 'p2', 'blocked')]),
      ],
      pins: new PinnedAgents(new MemoryStorage()),
    });
    expect(rows.map((r) => `${r.hostId}:${r.agent.pane_id}`)).toEqual(['a:p2', 'b:p1', 'a:p1']);
  });

  it('puts pinned Agents first, ranked by pin order', () => {
    const pins = new PinnedAgents(new MemoryStorage());
    pins.togglePin('a', 'p1');
    const { rows } = selectConsole({
      hosts: [view('a', [row('a', 'p1', 'idle'), row('a', 'p2', 'blocked')])],
      pins,
    });
    expect(rows[0]?.agent.pane_id).toBe('p1');
  });

  it('reports only connected Hosts with a snapshot as ready', () => {
    const hosts = [
      view('ready', []),
      view('waiting', [], { isAwaitingSnapshot: true }),
      view('away', [], { status: { kind: 'connecting' } }),
    ];
    expect(hosts.map(isHostReady)).toEqual([true, false, false]);
    const { readyHosts } = selectConsole({ hosts, pins: new PinnedAgents() });
    expect([...readyHosts]).toEqual(['ready']);
  });

  it('feeds the clocks with the rows and ready Hosts', () => {
    const clocks = new AgentStatusClocks(new MemoryStorage(), () => 1000);
    const { rows } = selectConsole({
      hosts: [view('a', [row('a', 'p1', 'working')])],
      pins: new PinnedAgents(),
      clocks,
    });
    const first = rows[0];
    expect(first && clocks.stamp(`a\u001fp1`)).toBeTruthy();
  });

  it('finds a row by key', () => {
    const rows = [row('a', 'p1', 'idle')];
    expect(findRow(rows, 'a\u001fp1')).toBe(rows[0]);
    expect(findRow(rows, 'a\u001fp9')).toBeUndefined();
  });
});

describe('groupForHome', () => {
  it('keeps order, splits sections and drops idle', () => {
    const groups = groupForHome([
      row('a', 'p1', 'blocked'),
      row('a', 'p2', 'working'),
      row('a', 'p3', 'idle'),
      row('a', 'p4', 'done'),
      row('a', 'p5', 'mystery'),
    ]);
    expect(groups.needsYou).toHaveLength(1);
    expect(groups.working).toHaveLength(1);
    expect(groups.done).toHaveLength(1);
  });
});
