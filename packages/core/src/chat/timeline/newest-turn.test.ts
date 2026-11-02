// Ported from Swift ChatTimelineProjectionTests (turn folds, the newest turn, groups, layout).

import { describe, expect, it } from 'vitest';
import type { ChatAgentActivity, ChatTurnEnd } from '../model/types';
import {
  find,
  groupOf,
  IDLE,
  ids,
  project,
  START,
  text,
  tool,
  toolIn,
  turn,
  turnHeaderOf,
  user,
  WORKING,
} from './helpers.test-util';
import { newestPhase } from './projection';
import {
  type ChatOlderHistory,
  type ChatRowID,
  chatRow,
  isExpandable,
  isLiveRows,
  rowID,
  turnSignals,
} from './row';

const _entry = rowID.entry;

import { olderRow } from './helpers.test-util';

const entry = rowID.entry;
describe('the newest turn', () => {
  it('shows how long a running turn has worked', () => {
    const rows = [user('u1'), text('n1'), tool('c1'), text('a1')];
    const output = project(rows, { turns: [turn('u1', { ended: false })], signals: WORKING });
    expect(ids(output)).toEqual(['u1', '[working]', 'n1', 'c1', 'a1']);
    expect(turnHeaderOf(output, rowID.liveTurn)?.state).toEqual({ kind: 'working', since: START });
    const header = find(output, rowID.liveTurn);
    expect(header && isExpandable(header)).toBe(false);
  });

  it('has no header when the start is unknown', () => {
    const bare = { firstEntryID: 'u1', startedAt: null, endedAt: null, ending: null };
    const rows = [user('u1'), tool('c1'), text('a1')];
    expect(ids(project(rows, { turns: [bare], signals: WORKING }))).toEqual(['u1', 'c1', 'a1']);
  });

  it.each(['working', 'blocked', 'unknown'] as ChatAgentActivity[])(
    'runs a turn no record closed unless the Agent is idle (%s)',
    (activity) => {
      const rows = [user('u1'), tool('c1'), text('a1')];
      const turns = [turn('u1', { ended: false })];
      expect(ids(project(rows, { turns, signals: turnSignals({ activity }) }))).toEqual([
        'u1',
        '[working]',
        'c1',
        'a1',
      ]);
      expect(ids(project(rows, { turns, signals: IDLE }))).toEqual(['u1', '[turn a1]', 'a1']);
    },
  );

  it.each(['working', 'blocked', 'unknown'] as ChatAgentActivity[])(
    'does not run an open turn without a live Host (%s)',
    (activity) => {
      const rows = [user('u1'), tool('c1'), text('a1')];
      const signals = turnSignals({ activity, isLive: false });
      expect(newestPhase(null, signals)).toBe('settled');
      expect(ids(project(rows, { turns: [turn('u1', { ended: false })], signals }))).toEqual([
        'u1',
        '[turn a1]',
        'a1',
      ]);
      expect(newestPhase(null, { ...signals, isBackgroundWorkRunning: true })).toBe('held');
    },
  );

  it('is live only from a connected Host and a fresh read', () => {
    const connected = { kind: 'connected' } as const;
    const failure = new Error('x') as never;
    const cases: [Parameters<typeof isLiveRows>[0], boolean, boolean][] = [
      [connected, false, true],
      [connected, true, false],
      [{ kind: 'connecting' }, false, false],
      [{ kind: 'reconnecting', attempt: 1, delayMs: 1000, failure }, false, false],
      [{ kind: 'suspended' }, false, false],
      [null, false, false],
    ];
    for (const [status, isFromCache, expected] of cases) {
      expect(isLiveRows(status, { isFromCache })).toBe(expected);
    }
  });

  it('shows running calls as last seen without a live Host', () => {
    const rows = [
      user('u1'),
      tool('c1'),
      tool('c2', 'command', { status: 'running' }),
      tool('t1', 'agent', { name: 'Agent', status: 'running' }),
    ];
    const open = new Set<ChatRowID>([rowID.group('c2')]);
    const turns = [turn('u1', { ended: false })];
    const live = project(rows, { turns, signals: WORKING, open });
    expect(toolIn(live, 't1')?.isNotUpdating).toBe(false);
    const saved = project(rows, {
      turns,
      signals: turnSignals({ activity: 'working', isLive: false }),
      open,
    });
    expect(ids(saved)).toEqual(['u1', '[group c2]', '  c1', '  c2', 't1']);
    expect(toolIn(saved, 'c1')?.isNotUpdating).toBe(false);
    expect(toolIn(saved, 'c2')?.isNotUpdating).toBe(true);
    expect(toolIn(saved, 't1')?.isNotUpdating).toBe(true);
    expect(groupOf(saved, rowID.group('c2'))?.isRunning).toBe(false);
    expect(find(saved, entry('c1'))?.revision).toBe(1);
    expect(find(saved, entry('c2'))?.revision).not.toBe(1);
  });

  it('keeps a closed turn finished while the next one is not recorded yet', () => {
    const rows = [user('u1'), tool('c1'), text('a1')];
    expect(ids(project(rows, { turns: [turn('u1')], signals: WORKING }))).toEqual([
      'u1',
      '[turn a1]',
      'a1',
    ]);
  });

  it('keeps the newest turn open while Background Work runs', () => {
    const rows = [user('u1'), tool('c1'), tool('c2'), text('a1')];
    const signals = turnSignals({ activity: 'idle', isBackgroundWorkRunning: true });
    expect(ids(project(rows, { turns: [turn('u1')], signals }))).toEqual([
      'u1',
      '[group c2]',
      'a1',
    ]);
  });

  it('leaves the running turn running under a pending message', () => {
    const pending = chatRow(
      rowID.pending('p'),
      { type: 'pending', echo: { id: 'p', text: 'next', state: { kind: 'sending' } } },
      1,
    );
    const rows = [
      user('u1'),
      tool('c1'),
      tool('c2'),
      tool('c3', 'command', { status: 'running' }),
      pending,
    ];
    const output = project(rows, { turns: [turn('u1', { ended: false })], signals: WORKING });
    expect(ids(output)).toEqual(['u1', '[working]', '[live group c1]', 'c3', 'pending']);
    const done = [user('u1'), tool('c1'), text('a1'), pending];
    expect(ids(project(done, { turns: [turn('u1')], signals: WORKING }))).toEqual([
      'u1',
      '[turn a1]',
      'a1',
      'pending',
    ]);
  });

  it('lets a prompt open a turn when the program records none', () => {
    const rows = [
      user('u1'),
      tool('c1'),
      text('a1'),
      user('q1', true),
      text('a2'),
      user('u2'),
      tool('c2'),
      text('a3'),
    ];
    expect(ids(project(rows, { turns: [], signals: WORKING }))).toEqual([
      'u1',
      'q1',
      '[turn a2]',
      'a2',
      'u2',
      'c2',
      'a3',
    ]);
  });
});

describe('rows above the first loaded turn', () => {
  const rowsWith = (older: ChatOlderHistory) => [
    olderRow(older),
    tool('c0'),
    tool('c1'),
    text('a0'),
    user('u1'),
    text('a1'),
  ];
  const available: ChatOlderHistory[] = ['available', 'loading', { failed: 'x' }];

  it('folds once nothing older remains, and shows as they load before', () => {
    const ended = project(rowsWith('reachedStart'), { turns: [turn('u1')] });
    expect(ids(ended)).toEqual(['older', '[turn a0]', 'a0', 'u1', 'a1']);
    expect(turnHeaderOf(ended, rowID.turn('a0'))?.state).toEqual({ kind: 'worked', seconds: null });
    for (const older of available) {
      expect(ids(project(rowsWith(older), { turns: [turn('u1')] }))).toEqual([
        'older',
        '[group c1]',
        'a0',
        'u1',
        'a1',
      ]);
    }
  });

  it('folds once earlier messages wait for the user', () => {
    const waiting = turnSignals({ activity: 'idle', olderAwaitsUser: true });
    const end: ChatTurnEnd = { ending: 'completed', endedAt: START, duration: 136.363 };
    for (const older of available) {
      const timed = project(rowsWith(older), {
        turns: [turn('u1')],
        precedingTurnEnd: end,
        signals: waiting,
      });
      expect(ids(timed)).toEqual(['older', '[turn a0]', 'a0', 'u1', 'a1']);
      expect(turnHeaderOf(timed, rowID.turn('a0'))?.state).toEqual({
        kind: 'worked',
        seconds: 136.363,
      });
    }
    const untimed = project(rowsWith('available'), { turns: [turn('u1')], signals: waiting });
    expect(turnHeaderOf(untimed, rowID.turn('a0'))?.state).toEqual({
      kind: 'worked',
      seconds: null,
    });
    const stopped = project(rowsWith('available'), {
      turns: [turn('u1')],
      precedingTurnEnd: { ending: 'interrupted', endedAt: START, duration: null },
      signals: waiting,
    });
    expect(ids(stopped)).toEqual(['older', '[group c1]', 'a0', 'u1', 'a1']);
  });

  it('is closed by the record that ends the turn above the loaded rows', () => {
    const rows = [olderRow('available'), tool('c0'), tool('c1'), text('a0')];
    const waiting = turnSignals({ activity: 'working', olderAwaitsUser: true });
    const ended = project(rows, {
      turns: [],
      precedingTurnEnd: { ending: 'completed', endedAt: null, duration: null },
      signals: waiting,
    });
    expect(ids(ended)).toEqual(['older', '[turn a0]', 'a0']);
    expect(ids(project(rows, { turns: [], signals: waiting }))).toEqual([
      'older',
      '[group c1]',
      'a0',
    ]);
  });

  it('ignores that end until earlier messages wait', () => {
    const loading = [olderRow('available'), tool('c0'), tool('c1')];
    const end: ChatTurnEnd = { ending: 'completed', endedAt: null, duration: null };
    expect(ids(project(loading, { turns: [], precedingTurnEnd: end, signals: WORKING }))).toEqual(
      ids(project(loading, { turns: [], signals: WORKING })),
    );
    const loaded = [tool('c0'), tool('c1'), text('a0')];
    const interrupted: ChatTurnEnd = { ending: 'interrupted', endedAt: null, duration: null };
    expect(ids(project(loaded, { turns: [], precedingTurnEnd: interrupted }))).toEqual(
      ids(project(loaded, { turns: [] })),
    );
  });
});
