// Ported from Swift ChatTimelineProjectionTests (turn folds, the newest turn, groups, layout).

import { describe, expect, it } from 'vitest';
import {
  entryRow,
  find,
  ids,
  notice,
  project,
  text,
  tool,
  turn,
  turnHeaderOf,
  user,
  WORKING,
} from './helpers.test-util';
import { rowID, turnSignals } from './row';

const _entry = rowID.entry;

import { finished, subagentTool } from './helpers.test-util';

const entry = rowID.entry;
describe('turn folds', () => {
  it('folds a finished turn behind a header above its answer', () => {
    const output = project(finished, { turns: [turn('u1')] });
    expect(ids(output)).toEqual(['u1', 'p1', '[turn a1]', 'a1', 'a2']);
    expect(turnHeaderOf(output, rowID.turn('a1'))).toEqual({
      state: { kind: 'worked', seconds: 35 },
      isOpen: false,
      stepCount: 5,
    });
    for (const id of ['n1', 'c1', 'r1', 'c2', 'e1']) {
      expect(output.owners.get(entry(id))).toBe(rowID.turn('a1'));
    }
  });

  it('shows an open turn with its groups closed and its text muted', () => {
    const output = project(finished, { turns: [turn('u1')], open: new Set([rowID.turn('a1')]) });
    expect(ids(output)).toEqual(['u1', 'p1', '[turn a1]', 'n1', '[group c2]', 'e1', 'a1', 'a2']);
    expect(turnHeaderOf(output, rowID.turn('a1'))?.isOpen).toBe(true);
    expect(find(output, entry('n1'))?.isMuted).toBe(true);
    expect(find(output, entry('a1'))?.isMuted).toBe(false);
    expect(output.owners.get(entry('r1'))).toBe(rowID.group('c2'));
    expect(output.owners.has(entry('n1'))).toBe(false);
  });

  it('shows an open group in an open turn nested', () => {
    const output = project(finished, {
      turns: [turn('u1')],
      open: new Set([rowID.turn('a1'), rowID.group('c2')]),
    });
    expect(ids(output)).toEqual([
      'u1',
      'p1',
      '[turn a1]',
      'n1',
      '[group c2]',
      '  c1',
      '  r1',
      '  c2',
      'e1',
      'a1',
      'a2',
    ]);
    expect(output.owners.size).toBe(0);
  });

  it('reads a turn without a duration as unknown', () => {
    const bare = { firstEntryID: 'u1', startedAt: null, endedAt: null, ending: null };
    const output = project(finished, { turns: [bare] });
    expect(turnHeaderOf(output, rowID.turn('a1'))?.state).toEqual({
      kind: 'worked',
      seconds: null,
    });
  });

  it('leaves turns with nothing to fold or no answer open', () => {
    expect(ids(project([user('u1'), text('a1')], { turns: [turn('u1')] }))).toEqual(['u1', 'a1']);
    expect(ids(project([user('u1'), text('n1'), tool('c1')], { turns: [turn('u1')] }))).toEqual([
      'u1',
      'n1',
      'c1',
    ]);
    const pinned = [user('u1'), notice('t1', 'error'), text('a1')];
    expect(ids(project(pinned, { turns: [turn('u1')] }))).toEqual(['u1', 't1', 'a1']);
  });

  it('shows no row for a harness notice, in a turn or opening one', () => {
    const rows = [
      user('u1'),
      tool('c1'),
      notice('n1', 'taskNotification'),
      text('a1'),
      notice('n2', 'taskNotification'),
      tool('c2'),
      text('a2'),
    ];
    const output = project(rows, { turns: [turn('u1'), turn('n2')] });
    expect(ids(output)).toEqual(['u1', '[turn a1]', 'a1', '[turn a2]', 'a2']);
    // The notice still opens the turn the Agent answers it in, so its work folds on its own.
    const open = project(rows, {
      turns: [turn('u1'), turn('n2')],
      open: new Set([rowID.turn('a2')]),
    });
    expect(ids(open)).toEqual(['u1', '[turn a1]', 'a1', '[turn a2]', 'c2', 'a2']);
    expect(project(rows, { turns: [] }).rows.some((row) => row.content.type === 'notice')).toBe(
      false,
    );
  });

  it.each(['interrupted', 'failed'] as const)('does not fold a %s turn', (ending) => {
    const rows = [user('u1'), tool('c1'), text('a1')];
    expect(ids(project(rows, { turns: [turn('u1', { ending })] }))).toEqual(['u1', 'c1', 'a1']);
  });

  it('keeps pinned rows after the answer after it', () => {
    const rows = [
      user('u1'),
      tool('c1'),
      text('a1'),
      notice('x1', 'interrupted'),
      tool('s1', 'agent', { name: 'Agent' }),
    ];
    expect(ids(project(rows, { turns: [turn('u1')] }))).toEqual([
      'u1',
      '[turn a1]',
      'a1',
      'x1',
      's1',
    ]);
  });

  it('can turn folding off while groups still form', () => {
    const output = project(finished, {
      turns: [turn('u1')],
      signals: turnSignals({ activity: 'idle', foldsFinishedTurns: false }),
    });
    expect(ids(output)).toEqual(['u1', 'n1', '[group c2]', 'p1', 'e1', 'a1', 'a2']);
  });

  it('finishes every earlier turn', () => {
    const rows = [user('u1'), tool('c1'), text('a1'), user('u2'), tool('c2')];
    const output = project(rows, {
      turns: [turn('u1', { ended: false }), turn('u2', { ended: false })],
      signals: WORKING,
    });
    expect(ids(output)).toEqual(['u1', '[turn a1]', 'a1', 'u2', '[working]', 'c2']);
  });

  it('folds a turn opened by a row that is not a prompt', () => {
    const rows = [text('n1'), tool('c1'), text('a1')];
    expect(ids(project(rows, { turns: [turn('n1')] }))).toEqual(['[turn a1]', 'a1']);
  });

  it('keeps a question above the fold of its turn', () => {
    const rows = [
      user('u1'),
      tool('c1'),
      tool('q1', 'question', { name: 'AskUserQuestion' }),
      tool('c2'),
      text('a1'),
    ];
    expect(ids(project(rows, { turns: [turn('u1')] }))).toEqual(['u1', 'q1', '[turn a1]', 'a1']);
  });

  it('folds a Codex wait while subagent cards stay pinned', () => {
    const sub = (id: string, path: string) =>
      entryRow(id, { type: 'tool', tool: { ...subagentTool(path, 'started') } });
    const rows = [
      user('u1'),
      sub('s1', '/root/probe_a'),
      sub('s2', '/root/probe_b'),
      tool('w1', 'other', { name: 'wait', title: 'Waited for subagents' }),
      tool('w2', 'other', { name: 'wait', title: 'Waited for subagents' }),
      text('a1'),
    ];
    const output = project(rows, { turns: [turn('u1')] });
    expect(ids(output)).toEqual(['u1', 's1', 's2', '[turn a1]', 'a1']);
    expect(output.owners.get(entry('w1'))).toBe(rowID.turn('a1'));
    expect(output.owners.get(entry('w2'))).toBe(rowID.turn('a1'));
  });
});
