// Ported from Swift ChatTimelineProjectionTests (turn folds, the newest turn, groups, layout).

import { describe, expect, it } from 'vitest';
import {
  entryRow,
  fileChange,
  fileChanges,
  find,
  groupOf,
  groupSummary,
  IDLE,
  ids,
  notice,
  project,
  text,
  thought,
  tool,
  toolIn,
  turn,
  user,
  WORKING,
} from './helpers.test-util';
import { projectTimeline } from './projection';
import { type ChatRow, type ChatRowID, isHeaderID, rowID } from './row';

const _entry = rowID.entry;

import { finished, subagentTool } from './helpers.test-util';

const entry = rowID.entry;
describe('groups', () => {
  it('makes no group of one call, even with many files', () => {
    const changes = fileChanges(['a', 'b', 'c'].map((p) => fileChange(`${p}.swift`)));
    const rows = [user('u1'), tool('e1', 'fileEdit', { name: 'Edit', changes }), text('n1')];
    expect(ids(project(rows, { turns: [turn('u1', { ended: false })], signals: WORKING }))).toEqual(
      ['u1', '[working]', 'e1', 'n1'],
    );
  });

  it('lets reasoning join a run and hides blank reasoning', () => {
    const rows = [
      user('u1'),
      thought('r0'),
      tool('c1'),
      thought('r1'),
      thought('b1', ''),
      tool('c2'),
      thought('r2'),
      thought('b2', ''),
      text('n1'),
    ];
    const output = project(rows, {
      turns: [turn('u1', { ended: false })],
      signals: WORKING,
      open: new Set([rowID.group('c2')]),
    });
    expect(ids(output)).toEqual([
      'u1',
      '[working]',
      'r0',
      '[group c2]',
      '  c1',
      '  r1',
      '  c2',
      'r2',
      'n1',
    ]);
    expect(groupOf(output, rowID.group('c2'))?.calls).toBe(2);
  });

  it('breaks runs at everything but reasoning', () => {
    const breakers: ChatRow[] = [
      text('x'),
      notice('x', 'system'),
      entryRow('x', { type: 'divider', divider: { kind: 'compaction', detail: null } }),
      user('x', true),
      tool('x', 'agent', { name: 'Agent' }),
      tool('x', 'question', { name: 'AskUserQuestion' }),
      tool('x', 'command', { status: 'awaitingApproval' }),
      tool('x', 'command', { name: 'user_shell' }),
    ];
    for (const breaker of breakers) {
      const rows = [user('u1'), tool('c1'), breaker, tool('c2'), text('n1')];
      const output = project(rows, { turns: [turn('u1', { ended: false })], signals: WORKING });
      expect(output.rows.some((row) => isHeaderID(row.id) && row.id !== rowID.liveTurn)).toBe(
        false,
      );
    }
  });

  it('keeps the newest call of a running run as its own row', () => {
    const rows = [
      user('u1'),
      tool('c1'),
      tool('c2'),
      tool('c3', 'command', { status: 'running' }),
      thought('r1'),
    ];
    const turns = [turn('u1', { ended: false })];
    const output = project(rows, { turns, signals: WORKING });
    expect(ids(output)).toEqual(['u1', '[working]', '[live group c1]', 'c3', 'r1']);
    expect(groupSummary(output, rowID.liveGroup('c1'))).toBe('Ran 2 commands');
    const settled = project([...rows, text('n1')], { turns, signals: WORKING });
    expect(ids(settled)).toEqual(['u1', '[working]', '[group c3]', 'r1', 'n1']);
    expect(groupOf(settled, rowID.group('c3'))?.isRunning).toBe(true);
  });

  it('keeps the live group while the newest call waits for approval', () => {
    const rows = [user('u1'), tool('c1'), tool('c2'), tool('c3', 'command', { status: 'running' })];
    const turns = [turn('u1', { ended: false })];
    expect(ids(project(rows, { turns, signals: WORKING }))).toEqual([
      'u1',
      '[working]',
      '[live group c1]',
      'c3',
    ]);
    const asking = [
      ...rows.slice(0, -1),
      tool('c3'),
      thought('r1'),
      tool('c4', 'command', { status: 'awaitingApproval' }),
    ];
    const waiting = project(asking, { turns, signals: WORKING });
    expect(ids(waiting)).toEqual(['u1', '[working]', '[live group c1]', 'r1', 'c4']);
    expect(groupSummary(waiting, rowID.liveGroup('c1'))).toBe('Ran 3 commands');
  });

  it('sums diffs and counts failures in the header', () => {
    const rows = [
      user('u1'),
      tool('e1', 'fileEdit', { name: 'Edit', diff: { added: 3, removed: 1, files: 1 } }),
      tool('e2', 'fileEdit', {
        name: 'Edit',
        status: 'failed',
        diff: { added: 2, removed: 4, files: 1 },
      }),
      tool('c1', 'command', { status: 'declined' }),
      text('n1'),
    ];
    const output = project(rows, { turns: [turn('u1', { ended: false })], signals: WORKING });
    const group = groupOf(output, rowID.group('c1'));
    expect(group).toMatchObject({ added: 5, removed: 5, failed: 2, kind: 'fileEdit' });
    expect(groupSummary(output, rowID.group('c1'))).toBe('Ran 1 command, Edited 2 files');
  });
});

describe('subagents', () => {
  const sub = (id: string, path: string | null, event: string) =>
    entryRow(id, { type: 'tool', tool: subagentTool(path, event) });

  it('merges interleaved events by full path and keeps the latest status', () => {
    const rows = [
      user('u1'),
      sub('a1', '/root/a/task', 'started'),
      sub('b1', '/root/b/task', 'started'),
      tool('call', 'agent', { name: 'Agent', title: 'Subagent: task' }),
      sub('a2', '/root/a/task', 'completed'),
      sub('b2', '/root/b/task', 'completed'),
      sub('a3', '/root/a/task', 'interacted'),
    ];
    const output = project(rows, { turns: [turn('u1')] });
    expect(ids(output)).toEqual(['u1', 'a1', 'b1', 'call']);
    expect(toolIn(output, 'a1')?.subagentActivity?.events).toEqual([
      'started',
      'completed',
      'interacted',
    ]);
    expect(toolIn(output, 'a1')?.status).toBe('noResult');
    expect(toolIn(output, 'b1')?.status).toBe('succeeded');
    expect(toolIn(output, 'a1')?.output).toBeNull();
    expect(output.owners.get(entry('a2'))).toBe(entry('a1'));
    expect(output.owners.get(entry('a3'))).toBe(entry('a1'));
    expect(output.owners.get(entry('b2'))).toBe(entry('b1'));
  });

  it('does not merge unknown identities', () => {
    const rows = [
      sub('a', null, 'started'),
      sub('b', null, 'completed'),
      sub('c', '', 'started'),
      sub('d', '', 'interacted'),
    ];
    const output = project(rows, { turns: [] });
    expect(ids(output)).toEqual(['a', 'b', 'c', 'd']);
    expect(output.owners.size).toBe(0);
  });

  it('keeps identity and changes revision when an event arrives', () => {
    const rows = [user('u1'), sub('a1', '/root/task', 'started')];
    const more = [...rows, sub('a2', '/root/task', 'interacted')];
    const before = project(rows, { turns: [turn('u1')] });
    const appended = project(more, { turns: [turn('u1')] });
    const repeated = project(more, { turns: [turn('u1')] });
    expect(ids(before)).toEqual(ids(appended));
    expect(before.rows.at(-1)?.revision).not.toBe(appended.rows.at(-1)?.revision);
    expect(appended.rows.at(-1)?.revision).toBe(repeated.rows.at(-1)?.revision);
  });

  it('stops merging at turns and user messages', () => {
    const rows = [
      user('u1'),
      sub('a1', '/root/task', 'started'),
      user('queued', true),
      sub('a2', '/root/task', 'interacted'),
      user('u2'),
      sub('a3', '/root/task', 'completed'),
    ];
    const output = project(rows, { turns: [turn('u1'), turn('u2')] });
    expect(ids(output)).toEqual(['u1', 'a1', 'queued', 'a2', 'u2', 'a3']);
    expect(output.owners.size).toBe(0);
  });

  it('keeps a merged subagent pinned and its anchors when tools and turns fold', () => {
    const rows = [
      user('u1'),
      sub('a1', '/root/task', 'started'),
      tool('c1'),
      tool('c2'),
      sub('a2', '/root/task', 'completed'),
      text('answer'),
    ];
    const closed = project(rows, { turns: [turn('u1')] });
    expect(ids(closed)).toEqual(['u1', 'a1', '[turn answer]', 'answer']);
    expect(closed.owners.get(entry('a2'))).toBe(entry('a1'));
    const open = project(rows, { turns: [turn('u1')], open: new Set([rowID.turn('answer')]) });
    expect(ids(open)).toEqual(['u1', 'a1', '[turn answer]', '[group c2]', 'answer']);
    expect(open.owners.get(entry('a2'))).toBe(entry('a1'));
  });
});

describe('layout', () => {
  it('spaces shown rows for their shown neighbors', () => {
    const output = project(finished, { turns: [turn('u1')] });
    // Prompt, plan, header, answer, answer.
    expect(output.rows.map((row) => row.topSpacing)).toEqual([8, 12, 10, 12, 12]);
  });

  it('keeps ids and revisions when earlier history arrives above', () => {
    const newer = [user('u1'), tool('c1'), tool('c2'), text('a1')];
    const older = [user('u0'), text('a0')];
    const open = new Set<ChatRowID>([rowID.turn('a1')]);
    const before = project(newer, { turns: [turn('u1')], open });
    const after = project([...older, ...newer], { turns: [turn('u0'), turn('u1')], open });
    expect(ids(before)).toEqual(['u1', '[turn a1]', '[group c2]', 'a1']);
    expect(ids(after)).toEqual(['u0', 'a0', 'u1', '[turn a1]', '[group c2]', 'a1']);
    expect(find(before, rowID.group('c2'))?.revision).toBe(
      find(after, rowID.group('c2'))?.revision,
    );
  });

  it('records each turn trajectory with its header', () => {
    const output = projectTimeline(finished, { turns: [turn('u1')], signals: IDLE });
    const [trajectory] = output.trajectories;
    expect(trajectory?.turnHeader).toBe(rowID.turn('a1'));
    expect(trajectory?.shownIDs).toEqual(output.rows.map((row) => row.id));
    expect(trajectory?.rowIDs.has(entry('c1'))).toBe(true);
  });
});
