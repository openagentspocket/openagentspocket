import { describe, expect, it } from 'vitest';
import type * as herdr from '../protocol/herdr-types.generated';
import type { ConsoleTerminal } from './row';
import { projectSnapshot } from './snapshot-rows';
import { groupTerminals, terminalTitle } from './terminals';
import { agentInfo, snapshotOf } from './testing';

const shell = (paneId: string, workspaceId: string, extra: Partial<ConsoleTerminal> = {}) => ({
  hostId: 'h',
  hostName: 'Host',
  paneId,
  tabId: 't',
  terminalId: paneId,
  workspaceId,
  ...extra,
});

describe('groupTerminals', () => {
  it('groups by workspace in first-seen order', () => {
    const groups = groupTerminals([
      shell('a', 'w1', { workspaceLabel: 'One' }),
      shell('b', 'w2'),
      shell('c', 'w1'),
    ]);
    expect(groups.map((g) => [g.id, g.workspaceLabel, g.terminals.length])).toEqual([
      ['h/w1', 'One', 2],
      ['h/w2', 'w2', 1],
    ]);
  });
});

describe('terminalTitle', () => {
  it('prefers the label, then the directory name, then the pane id', () => {
    expect(terminalTitle(shell('a', 'w', { label: 'logs' }))).toBe('logs');
    expect(terminalTitle(shell('a', 'w', { cwd: '/work/mobile' }))).toBe('mobile');
    expect(terminalTitle(shell('a', 'w'))).toBe('a');
  });
});

describe('projectSnapshot terminals', () => {
  it('lists the panes that run no Agent, with their workspace and directory', () => {
    const agent = agentInfo('p1', 'working');
    const pane = (paneId: string, over: Partial<herdr.PaneInfo> = {}): herdr.PaneInfo => ({
      agent_status: 'unknown',
      focused: false,
      pane_id: paneId,
      revision: 1,
      tab_id: 't',
      terminal_id: `term_${paneId}`,
      workspace_id: agent.workspace_id,
      ...over,
    });
    const projected = projectSnapshot({
      host: { id: 'h', name: 'Host' },
      snapshot: snapshotOf([agent], {
        panes: [
          pane('p1'),
          pane('s1', { label: 'logs', cwd: '/work/a', foreground_cwd: '/work/b' }),
        ],
      }),
      previous: new Map(),
      paneChanges: new Map(),
      paneStart: 0,
      statusChanges: new Map(),
      statusStart: 0,
    });
    expect(projected.terminals.map((t) => [t.paneId, t.label, t.cwd])).toEqual([
      ['s1', 'logs', '/work/b'],
    ]);
  });
});

describe('where a new shell opens', () => {
  it('falls back to a pane directory for a workspace that is no checkout', () => {
    const snapshot = snapshotOf([], {
      panes: [
        { pane_id: 'p', tab_id: 't', workspace_id: 'w1', cwd: '/srv/plain' } as herdr.PaneInfo,
      ],
    });
    const host = { id: 'h', name: 'Host' };
    const projected = projectSnapshot({
      host,
      snapshot,
      previous: new Map(),
      paneChanges: new Map(),
      paneStart: 0,
      statusChanges: new Map(),
      statusStart: 0,
    });
    expect(projected.workspaces[0]?.directory).toBe('/srv/plain');
  });
});
