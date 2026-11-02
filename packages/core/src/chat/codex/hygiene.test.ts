// Lines Codex itself would skip, repeat or cut short, and the ordinals that decide which line
// counts (Swift CodexLineHygieneTests).

import { describe, expect, it } from 'vitest';
import { frameLines, JsonlLineFramer } from '../model/lines';
import type { ChatEntry } from '../model/types';
import { CodexRolloutReducer } from './reducer';
import { IDLE, RolloutBuilder } from './test-builder';

const ids = (entries: ChatEntry[]): string[] => entries.map((entry) => entry.id);

describe('Codex line hygiene', () => {
  it('keeps the first line of a repeated ordinal', () => {
    const b = new RolloutBuilder();
    b.turnStarted('t1');
    b.userMessage('t1', 'u1', 'hello');
    b.agentMessage('t1', 'a1', 'kept');
    b.nextOrdinal -= 1;
    b.agentMessage('t1', 'a1', 'written again');
    b.turnComplete('t1');
    const projection = b.reducer().projection(IDLE);
    expect(ids(projection.transcript.entries)).toEqual(['codex/r1/t1/u1', 'codex/r1/t1/a1']);
    expect(projection.transcript.entries[1]?.content).toEqual({
      type: 'assistant',
      value: { text: 'kept' },
    });
    expect(projection.ordinals).toEqual({ missing: 0, duplicates: 1, gaps: 0, inherited: 0 });
  });

  it('skips a line without an ordinal', () => {
    const b = new RolloutBuilder();
    b.turnStarted('t1');
    b.userMessage('t1', 'u1', 'hello');
    b.item(
      't1',
      { type: 'AgentMessage', id: 'a0', content: [{ type: 'Text', text: 'unordered' }] },
      null,
    );
    b.agentMessage('t1', 'a1', 'ordered');
    b.turnComplete('t1');
    const projection = b.reducer().projection(IDLE);
    expect(ids(projection.transcript.entries)).toEqual(['codex/r1/t1/u1', 'codex/r1/t1/a1']);
    expect(projection.ordinals.missing).toBe(1);
  });

  it('counts a gap in the ordinals and skips nothing', () => {
    const b = new RolloutBuilder();
    b.turnStarted('t1');
    b.userMessage('t1', 'u1', 'hello');
    b.nextOrdinal += 3;
    b.agentMessage('t1', 'a1', 'after the gap');
    b.turnComplete('t1');
    const projection = b.reducer().projection(IDLE);
    expect(ids(projection.transcript.entries)).toEqual(['codex/r1/t1/u1', 'codex/r1/t1/a1']);
    expect(projection.ordinals.gaps).toBe(1);
  });

  it("accepts but never shows a subagent's inherited history", () => {
    const b = new RolloutBuilder({ subagentHistoryStartOrdinal: 4 });
    b.turnStarted('parent');
    b.userMessage('parent', 'p1', 'parent prompt');
    b.turnComplete('parent');
    b.turnStarted('t1');
    b.userMessage('t1', 'u1', 'subagent task');
    b.turnComplete('t1');
    const projection = b.reducer().projection(IDLE);
    expect(projection.turns.map((t) => t.id)).toEqual(['t1']);
    expect(ids(projection.transcript.entries)).toEqual(['codex/r1/t1/u1']);
    expect(projection.ordinals.inherited).toBe(4);
  });

  it('skips a torn line before its rewrite and gives up its ordinal', () => {
    const b = new RolloutBuilder();
    b.turnStarted('t1');
    b.userMessage('t1', 'u1', 'hello');
    const torn = new RolloutBuilder();
    torn.lines = [...b.lines];
    torn.nextOrdinal = b.nextOrdinal;
    torn.agentMessage('t1', 'a1', 'complete answer');
    const whole = torn.lines[torn.lines.length - 1] as string;
    // The writer died inside the text; on reopen Codex rewrites the record under the same ordinal.
    b.raw(`${whole.slice(0, whole.indexOf('complete answer'))}comp`);
    b.agentMessage('t1', 'a1', 'complete answer');
    b.turnComplete('t1');
    const projection = b.reducer().projection(IDLE);
    expect(ids(projection.transcript.entries)).toEqual(['codex/r1/t1/u1', 'codex/r1/t1/a1']);
    expect(projection.transcript.diagnostics.invalidLines).toBe(1);
    expect(projection.ordinals).toEqual({ missing: 0, duplicates: 0, gaps: 0, inherited: 0 });
  });

  it('never stops on unknown records, items, phases and inputs', () => {
    const b = new RolloutBuilder();
    b.turnStarted('t1');
    b.record('future_record', { detail: 1 });
    b.event('future_event', { turn_id: 't1' });
    b.item('t1', { type: 'FutureItem', id: 'f1' });
    b.item('t1', {
      type: 'UserMessage',
      id: 'u1',
      content: [
        { type: 'text', text: 'look', text_elements: [] },
        { type: 'future_input', blob: 'x' },
      ],
    });
    b.agentMessage('t1', 'a1', 'partial', { phase: 'partial_answer' });
    b.agentMessage('t1', 'a2', 'final', { phase: 'future_phase' });
    b.item('t1', { type: 'Extension', id: 'e1', kind: 'future.kind' });
    b.turnAborted('t1', 'future_reason');
    const projection = b.reducer().projection(IDLE);
    const entries = projection.transcript.entries;
    expect(ids(entries)).toEqual([
      'codex/r1/t1/u1',
      'codex/r1/t1/a1',
      'codex/r1/t1/a2',
      'codex/r1/t1/~stopped',
    ]);
    expect(entries[0]?.content).toMatchObject({
      type: 'user',
      value: { text: 'look', attachmentLabels: ['Attachment'] },
    });
    expect(entries[3]?.content).toMatchObject({ type: 'notice', value: { kind: 'stopped' } });
    expect(projection.turns.map((t) => t.status)).toEqual(['interrupted']);
    expect([...projection.transcript.diagnostics.unknownRecordTypes].sort()).toEqual(
      [
        'future_record',
        'event_msg/future_event',
        'item_completed/FutureItem',
        'item_completed/Extension/future.kind',
      ].sort(),
    );
    // A newer writer numbered the lines this reader cannot parse.
    expect(projection.ordinals.gaps).toBe(1);
  });

  it('titles a 3 MiB command line from its prefix and changes nothing else', () => {
    const output = 'y\n'.repeat(1_572_864);
    const b = new RolloutBuilder();
    b.turnStarted('t1');
    b.userMessage('t1', 'u1', 'print a lot');
    b.command('t1', 'c1', ['bash', '-lc', 'yes | head -n 1572864'], { output });
    b.agentMessage('t1', 'a1', 'done');
    b.turnComplete('t1');
    const commandLine = b.chatLines[3];
    expect(commandLine?.length).toBeGreaterThan(3 * 1024 * 1024);

    const framer = new JsonlLineFramer({
      startOffset: 0,
      lineCap: 1024 * 1024,
      prefixCap: 16 * 1024,
    });
    const reducer = new CodexRolloutReducer('r1');
    let largest = 0;
    const data = b.data;
    for (let at = 0; at < data.length; at += 512 * 1024) {
      const lines = framer.append(data.subarray(at, at + 512 * 1024));
      for (const line of lines) largest = Math.max(largest, line.data.length);
      reducer.append(lines);
    }
    expect(largest).toBe(16 * 1024);

    // The prefix keeps the argv and status but not the exit code, which follows the output.
    const cut = reducer.transcript(IDLE);
    expect(ids(cut.entries)).toEqual(['codex/r1/t1/u1', 'codex/r1/t1/c1', 'codex/r1/t1/a1']);
    expect(cut.entries[1]?.content).toMatchObject({
      type: 'tool',
      value: {
        kind: 'command',
        title: 'yes | head -n 1572864',
        status: 'succeeded',
        exitCode: null,
        preview: null,
        output: { offset: commandLine?.offset, length: commandLine?.length },
      },
    });
    expect(cut.diagnostics.invalidLines + cut.diagnostics.oversizedLines).toBe(0);

    const whole = b.reducer().transcript(IDLE);
    expect(whole.entries[1]?.content).toMatchObject({
      type: 'tool',
      value: { exitCode: 0, preview: { isTruncated: true } },
    });
  });

  it('counts and skips a message cut to its prefix', () => {
    const b = new RolloutBuilder();
    b.turnStarted('t1');
    b.userMessage('t1', 'u1', 'a'.repeat(40_000));
    b.agentMessage('t1', 'a1', 'short');
    b.turnComplete('t1');
    const reducer = new CodexRolloutReducer('r1');
    reducer.append(frameLines(b.data, { lineCap: 32 * 1024, prefixCap: 16 * 1024 }));
    const projection = reducer.projection(IDLE);
    expect(ids(projection.transcript.entries)).toEqual(['codex/r1/t1/a1']);
    expect(projection.transcript.diagnostics.oversizedLines).toBe(1);
  });
});
