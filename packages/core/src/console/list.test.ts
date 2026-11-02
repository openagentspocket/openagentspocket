import { describe, expect, it } from 'vitest';
import {
  filterByHost,
  groupRows,
  isGroupOpen,
  matchesSearch,
  searchRows,
  statusGroups,
} from './list';
import type { ConsoleRow } from './row';
import type { StatusInboxItem } from './status-inbox';

interface RowOptions {
  workspace?: string;
  host?: string;
  workspaceLabel?: string;
}

function row(pane: string, options: RowOptions = {}): ConsoleRow {
  const { workspace = 'w1', host = 'h1', workspaceLabel } = options;
  return {
    hostId: host,
    hostName: host === 'h1' ? 'Alpha' : 'Beta',
    agent: {
      agent: 'claude',
      agent_status: 'idle',
      focused: false,
      pane_id: pane,
      revision: 1,
      tab_id: 't',
      terminal_id: pane,
      workspace_id: workspace,
      cwd: `/work/${pane}`,
    },
    workspaceLabel,
    workspaceTabCount: 1,
    tabPaneCount: 1,
  };
}

const panes = (rows: readonly ConsoleRow[]) => rows.map((r) => r.agent.pane_id);

const hosts = [
  { id: 'h1', name: 'Alpha' },
  { id: 'h2', name: 'Beta' },
];

describe('search', () => {
  it('matches case-insensitively over shown fields and ignores surrounding space', () => {
    const r = row('p1', { workspaceLabel: 'Billing API' });
    expect(matchesSearch(r, '  billing ')).toBe(true);
    expect(matchesSearch(r, 'work/p1')).toBe(true);
    expect(matchesSearch(r, 'alpha')).toBe(true);
    expect(matchesSearch(r, 'nothing')).toBe(false);
    expect(searchRows([r], '   ')).toEqual([r]);
  });
});

describe('host filter', () => {
  it('keeps only the chosen Host', () => {
    const rows = [row('a'), row('b', { host: 'h2' })];
    expect(panes(filterByHost(rows, 'h2'))).toEqual(['b']);
    expect(filterByHost(rows)).toHaveLength(2);
  });
});

describe('groupRows', () => {
  it('flat is one headerless group in the given order', () => {
    const [group] = groupRows([row('a'), row('b', { host: 'h2' }), row('c')], 'flat', { hosts });
    expect(panes(group?.rows ?? [])).toEqual(['a', 'b', 'c']);
    expect(group?.title).toBeUndefined();
  });

  it('by Host follows catalog order, keeps empty Hosts, drops them while searching', () => {
    const only = [row('a')];
    expect(groupRows(only, 'byHost', { hosts }).map((g) => g.id)).toEqual(['h1', 'h2']);
    expect(groupRows(only, 'byHost', { hosts, query: 'a' }).map((g) => g.id)).toEqual(['h1']);
    expect(groupRows(only, 'byHost', { hosts, hostId: 'h2' }).map((g) => g.id)).toEqual(['h2']);
  });

  it('by Workspace scopes ids to the Host and keeps first-seen order', () => {
    const mixed = [row('a'), row('b', { host: 'h2' }), row('c', { workspace: 'w2' }), row('d')];
    const groups = groupRows(mixed, 'byWorkspace', { hosts });
    expect(groups.map((g) => panes(g.rows))).toEqual([['a', 'd'], ['b'], ['c']]);
    expect(new Set(groups.map((g) => g.id)).size).toBe(3);
  });

  it('titles a Workspace from the first non-blank label, else none', () => {
    const groups = groupRows(
      [
        row('a', { workspaceLabel: ' ' }),
        row('b', { workspaceLabel: 'api' }),
        row('c', { workspace: 'w2' }),
      ],
      'byWorkspace',
      { hosts },
    );
    expect(groups.map((g) => g.title)).toEqual(['api', undefined]);
  });
});

describe('statusGroups', () => {
  const item = (r: ConsoleRow, section: StatusInboxItem['section']): StatusInboxItem => ({
    key: r.agent.pane_id,
    row: r,
    section,
    title: '',
    chips: [],
    isApproximate: false,
    isPinned: false,
  });

  it('lists every section in order, dropping empty ones only for a search', () => {
    const items = { working: [item(row('a'), 'working')] };
    expect(statusGroups(items).map((g) => g.section)).toEqual([
      'needsYou',
      'working',
      'doneRecent',
      'idle',
    ]);
    expect(statusGroups(items, 'a').map((g) => g.section)).toEqual(['working']);
  });
});

describe('isGroupOpen', () => {
  it('honors a fold except while searching', () => {
    const folded = new Set(['x']);
    expect(isGroupOpen('x', folded, '')).toBe(false);
    expect(isGroupOpen('x', folded, 'q')).toBe(true);
    expect(isGroupOpen('y', folded, '')).toBe(true);
  });
});
