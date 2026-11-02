// `/compact` turns and reverted rollouts that continue a base file (Swift CodexLineageTests).

import { describe, expect, it } from 'vitest';
import { projectionContext } from '../model/types';
import { matchPendingSends } from './pending-echo';
import { IDLE, RolloutBuilder } from './test-builder';

/** A rollout whose third turn (ordinals 9 on) a revert dropped. */
function base(): RolloutBuilder {
  const b = new RolloutBuilder();
  b.turnStarted('t1');
  b.userMessage('t1', 'u1', 'first');
  b.agentMessage('t1', 'a1', 'one');
  b.turnComplete('t1');
  b.turnStarted('t2');
  b.userMessage('t2', 'u2', 'second');
  b.command('t2', 'c2', ['ls']);
  b.turnComplete('t2');
  b.turnStarted('t3');
  b.userMessage('t3', 'u3', 'reverted');
  b.turnComplete('t3');
  return b;
}

/** The rollout the revert started: its header takes the first ordinal the base gave up. */
function child(baseID: string, endOrdinal: number, endOffset: number): RolloutBuilder {
  const b = new RolloutBuilder({
    historyBase: { rolloutID: baseID, endOrdinal, endOffset },
    firstOrdinal: endOrdinal,
  });
  b.turnStarted('t4');
  b.userMessage('t4', 'u4', 'after the revert');
  b.agentMessage('t4', 'a4', 'four');
  b.turnComplete('t4');
  return b;
}

describe('Codex compaction and revert lineage', () => {
  it('shows a /compact turn as its divider and settles the pending send', () => {
    const b = new RolloutBuilder();
    b.turnStarted('t1');
    b.userMessage('t1', 'u1', 'hello');
    b.agentMessage('t1', 'a1', 'hi');
    b.turnComplete('t1');
    const cursor = { rolloutID: 'r1', offset: b.endOffset };
    b.turnStarted('t2');
    b.compacted('');
    b.record('world_state', { cwd: '/work' });
    b.record('turn_context', { cwd: '/work', model: 'gpt-5.5' });
    b.event('thread_settings_applied', { thread_id: 'thread-1' });
    b.compaction('t2', 'c1');
    b.turnComplete('t2');

    const projection = b.reducer().projection(IDLE);
    expect(projection.turns.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(projection.turns.map((t) => t.status)).toEqual(['completed', 'completed']);
    expect(projection.turns[1]?.entryIDs).toEqual(['codex/r1/t2/c1']);
    expect(projection.transcript.entries[2]?.content).toEqual({
      type: 'divider',
      value: { kind: 'compaction', detail: null },
    });
    expect(projection.transcript.diagnostics.invalidLines).toBe(0);
    const pending = [
      { text: '/compact ', cursor },
      { text: 'hello ', cursor },
    ];
    expect(matchPendingSends(pending, projection.echoCandidates)).toEqual(['codex/r1/t2/c1', null]);
  });

  it('continues a reverted rollout from its base up to the boundary', () => {
    const baseLines = base().chatLines;
    const boundary = baseLines[9]?.offset as number;
    const reducer = child('base1', 9, boundary).reducer('child1');
    expect(reducer.pendingHistoryBase).toEqual({
      baseRolloutID: 'base1',
      endOrdinalExclusive: 9,
      endByteOffset: boundary,
    });
    const alone = reducer.transcript(IDLE);
    expect(alone.needsOlderHistory).toBe(true);
    expect(alone.entries.map((e) => e.id)).toEqual(['codex/child1/t4/u4', 'codex/child1/t4/a4']);

    reducer.setBaseSegment('base1', '/sessions/base1.jsonl', baseLines);
    expect(reducer.pendingHistoryBase).toBeNull();
    const projection = reducer.projection(IDLE);
    expect(projection.turns.map((t) => t.id)).toEqual(['t1', 't2', 't4']);
    expect(projection.transcript.entries.map((e) => e.id)).toEqual([
      'codex/base1/t1/u1',
      'codex/base1/t1/a1',
      'codex/base1/t2/u2',
      'codex/base1/t2/c2',
      'codex/child1/t4/u4',
      'codex/child1/t4/a4',
    ]);
    expect(projection.transcript.needsOlderHistory).toBe(false);
    // A base row's output is re-read from the base file.
    expect(projection.transcript.entries[3]?.content).toMatchObject({
      type: 'tool',
      value: {
        output: {
          path: '/sessions/base1.jsonl',
          offset: baseLines[7]?.offset,
          length: baseLines[7]?.length,
        },
      },
    });
    // Only the live rollout's prompts can be the echo of a send.
    expect(projection.transcript.recordedPrompts.map((p) => p.text)).toEqual(['after the revert']);
  });

  it("hides base history until the window reaches the live file's head", () => {
    const baseLines = base().chatLines;
    const reducer = child('base1', 9, baseLines[9]?.offset as number).reducer('child1');
    reducer.setBaseSegment('base1', '/sessions/base1.jsonl', baseLines);
    const tail = reducer.transcript(projectionContext({ windowStart: 100, activity: 'idle' }));
    expect(tail.entries.map((e) => e.id)).toEqual(['codex/child1/t4/u4', 'codex/child1/t4/a4']);
    expect(tail.needsOlderHistory).toBe(true);
  });

  it('follows each base to its own base until the chain ends', () => {
    const base0 = new RolloutBuilder();
    base0.turnStarted('t1');
    base0.userMessage('t1', 'u1', 'one');
    base0.turnComplete('t1');
    base0.turnStarted('t2');
    base0.userMessage('t2', 'u2', 'undone by base1');
    const base0Lines = base0.chatLines;

    const base1 = new RolloutBuilder({
      historyBase: {
        rolloutID: 'base0',
        endOrdinal: 4,
        endOffset: base0Lines[4]?.offset as number,
      },
      firstOrdinal: 4,
    });
    base1.turnStarted('t3');
    base1.userMessage('t3', 'u3', 'three');
    base1.turnComplete('t3');
    base1.turnStarted('t4');
    base1.userMessage('t4', 'u4', 'undone by the child');
    const base1Lines = base1.chatLines;

    const live = new RolloutBuilder({
      historyBase: {
        rolloutID: 'base1',
        endOrdinal: 8,
        endOffset: base1Lines[4]?.offset as number,
      },
      firstOrdinal: 8,
    });
    live.turnStarted('t5');
    live.userMessage('t5', 'u5', 'five');
    live.turnComplete('t5');

    const reducer = live.reducer('child1');
    reducer.setBaseSegment('base1', '/sessions/base1.jsonl', base1Lines);
    expect(reducer.pendingHistoryBase?.baseRolloutID).toBe('base0');
    expect(reducer.transcript(IDLE).needsOlderHistory).toBe(true);

    reducer.setBaseSegment('base0', '/sessions/base0.jsonl', base0Lines);
    expect(reducer.pendingHistoryBase).toBeNull();
    const transcript = reducer.transcript(IDLE);
    expect(transcript.entries.map((e) => e.id)).toEqual([
      'codex/base0/t1/u1',
      'codex/base1/t3/u3',
      'codex/child1/t5/u5',
    ]);
    expect(transcript.needsOlderHistory).toBe(false);
  });

  const broken = [
    'base file gone',
    'base ends before the boundary',
    'boundary inside a line',
    'last ordinal is not end - 1',
    'base is a legacy rollout',
    'base names the rollout itself',
  ] as const;

  it.each(broken)('shows history as unavailable when %s', (why) => {
    const baseLines = base().chatLines;
    const boundary = baseLines[9]?.offset as number;
    let baseID = 'base1';
    let endOrdinal = 9;
    let endOffset = boundary;
    let supplied = baseLines;
    if (why === 'base file gone') supplied = [];
    if (why === 'base ends before the boundary') supplied = baseLines.slice(0, 6);
    if (why === 'boundary inside a line') endOffset = boundary + 5;
    if (why === 'last ordinal is not end - 1') endOrdinal = 8;
    if (why === 'base is a legacy rollout') {
      const legacy = new RolloutBuilder({ dialect: 'legacy' });
      legacy.legacyUser('first');
      legacy.legacyAgent('one');
      supplied = legacy.chatLines;
      endOffset = legacy.endOffset;
    }
    if (why === 'base names the rollout itself') baseID = 'child1';
    const reducer = child(baseID, endOrdinal, endOffset).reducer('child1');
    reducer.setBaseSegment(baseID, `/sessions/${baseID}.jsonl`, supplied);
    const transcript = reducer.transcript(IDLE);
    expect(reducer.pendingHistoryBase).toBeNull();
    expect(transcript.needsOlderHistory).toBe(false);
    expect(transcript.entries.map((e) => e.id)).toEqual([
      'codex/child1/~history-unavailable',
      'codex/child1/t4/u4',
      'codex/child1/t4/a4',
    ]);
    expect(transcript.entries[0]?.content).toEqual({
      type: 'divider',
      value: { kind: 'historyUnavailable', detail: null },
    });
  });
});
