// Legacy rollouts: events and response items replayed through the rules of Codex's
// `ThreadHistoryBuilder`, with tool calls paired by `call_id` (Swift CodexLegacyReplayTests).

import { describe, expect, it } from 'vitest';
import type { ChatEntry } from '../model/types';
import { CodexRolloutReducer } from './reducer';
import { IDLE, RolloutBuilder, WORKING } from './test-builder';

function conversation(): RolloutBuilder {
  const b = new RolloutBuilder({ dialect: 'legacy' });
  b.legacyUser('<environment_context>\n  <cwd>/work</cwd>\n</environment_context>'); // L1
  b.legacyUser('first prompt'); // L2
  b.legacyReasoning('thinking a'); // L3
  b.legacyReasoning('thinking b'); // L4
  b.legacyAgent('first answer'); // L5
  b.legacyUser('second prompt'); // L6
  b.legacyAgent('second answer'); // L7
  b.event('context_compacted'); // L8
  b.compacted('summary for the model'); // L9
  b.legacyUser('third prompt'); // L10
  b.legacyAgent('third answer'); // L11
  b.rolledBack(1); // L12
  b.legacyUser('fourth prompt'); // L13
  b.legacyAgent(''); // L14
  return b;
}

const userTexts = (entries: ChatEntry[]): string[] =>
  entries.flatMap((e) => (e.content.type === 'user' ? [e.content.value.text] : []));

describe('Codex legacy replay', () => {
  it('replays events into implicit turns without the rolled-back turn', () => {
    const b = conversation();
    const lines = b.chatLines;
    const reducer = b.reducer();
    expect(reducer.support).toEqual({ type: 'supported', dialect: 'legacy' });
    const projection = reducer.projection(IDLE);
    const at = (i: number): number => lines[i]?.offset as number;
    expect(projection.turns.map((t) => t.id)).toEqual([2, 6, 13].map((i) => `legacy@${at(i)}`));
    expect(projection.turns.map((t) => t.status)).toEqual(['completed', 'completed', null]);
    expect(projection.transcript.entries.map((e) => e.id)).toEqual(
      [2, 3, 5, 6, 7, 8, 13].map((i) => `codex/r1/@${at(i)}`),
    );
    expect(projection.transcript.entries.map((e) => e.content.type)).toEqual([
      'user',
      'reasoning',
      'assistant',
      'user',
      'assistant',
      'divider',
      'user',
    ]);
    expect(projection.transcript.entries[1]?.content).toMatchObject({
      value: { text: 'thinking a\n\nthinking b' },
    });
    expect(projection.transcript.recordedPrompts.map((p) => p.text)).toEqual([
      'first prompt',
      'second prompt',
      'fourth prompt',
    ]);
    expect(projection.transcript.diagnostics.invalidLines).toBe(0);
  });

  it('takes the rolled-back turn rows away when the rollback arrives live', () => {
    const b = conversation();
    const lines = b.chatLines;
    const reducer = new CodexRolloutReducer('r1');
    reducer.append(lines.slice(0, 12));
    expect(userTexts(reducer.transcript(WORKING).entries)).toEqual([
      'first prompt',
      'second prompt',
      'third prompt',
    ]);
    reducer.append([lines[12] as (typeof lines)[number]]);
    expect(userTexts(reducer.transcript(WORKING).entries)).toEqual([
      'first prompt',
      'second prompt',
    ]);
    reducer.append(lines.slice(13));
    expect(reducer.projection(WORKING)).toEqual(b.reducer().projection(WORKING));
  });

  it('joins a prompt to a turn that holds only a compaction', () => {
    const b = new RolloutBuilder({ dialect: 'legacy' });
    b.compacted(''); // L1
    b.legacyUser('continue'); // L2
    b.legacyAgent('continuing'); // L3
    const lines = b.chatLines;
    const projection = b.reducer().projection(IDLE);
    expect(projection.turns.map((t) => t.id)).toEqual([`legacy@${lines[1]?.offset}`]);
    expect(projection.transcript.entries.map((e) => e.sourceOffset)).toEqual([
      lines[2]?.offset,
      lines[3]?.offset,
    ]);
  });

  it('ends explicit turns by id with a Stopped or failure row', () => {
    const b = new RolloutBuilder({ dialect: 'legacy' });
    b.turnStarted('t1'); // L1
    b.legacyUser('go'); // L2
    b.legacyAgent('working on it'); // L3
    b.turnAborted('t1'); // L4
    b.turnStarted('t2'); // L5
    b.legacyUser('again'); // L6
    b.turnComplete('t2', 'model overloaded'); // L7
    const projection = b.reducer().projection(IDLE);
    expect(projection.turns.map((t) => t.status)).toEqual(['interrupted', 'failed']);
    expect(projection.transcript.entries.map((e) => e.content.type)).toEqual([
      'user',
      'assistant',
      'notice',
      'user',
      'notice',
    ]);
    expect(projection.transcript.entries[4]?.content).toMatchObject({
      value: { kind: 'error', detail: 'model overloaded' },
    });
  });

  it('pairs calls with outputs in the 0.45 JSON and the text format', () => {
    const b = new RolloutBuilder({ dialect: 'legacy' });
    b.legacyUser('list files'); // L1
    b.legacyCall('shell', 'call-1', { command: ['bash', '-lc', 'ls'] }); // L2
    b.legacyCall('exec_command', 'call-2', { cmd: 'false' }); // L3
    b.legacyOutput('call-2', 'Exit code: 1\nWall time: 0.1 seconds\nOutput:\nboom'); // L4
    b.legacyOutput(
      'call-1',
      '{"output":"a.txt\\n","metadata":{"exit_code":0,"duration_seconds":0.1}}',
    ); // L5
    b.legacyCall('shell', 'call-3', { command: ['sleep', '60'] }); // L6
    const lines = b.chatLines;
    const reference = (i: number) => ({
      path: null,
      offset: lines[i]?.offset,
      length: lines[i]?.length,
    });
    const reducer = b.reducer();
    const transcript = reducer.transcript(WORKING);
    expect(transcript.entries.map((e) => e.sourceOffset)).toEqual(
      [1, 2, 3, 6].map((i) => lines[i]?.offset),
    );
    const tools = transcript.entries.flatMap((e) =>
      e.content.type === 'tool' ? [e.content.value] : [],
    );
    expect(tools[0]).toMatchObject({
      kind: 'command',
      title: 'ls',
      status: 'succeeded',
      exitCode: 0,
      callID: 'call-1',
      preview: { text: 'a.txt\n', isTruncated: false },
      output: reference(5),
    });
    expect(tools[1]).toMatchObject({
      title: 'false',
      status: 'failed',
      exitCode: 1,
      preview: { text: 'boom' },
      output: reference(4),
    });
    expect(tools[2]).toMatchObject({ title: 'sleep 60', status: 'running', output: reference(6) });
    expect(transcript.pendingRequests).toHaveLength(1);
    expect(transcript.pendingRequests[0]).toMatchObject({ callID: 'call-3', summary: 'sleep 60' });

    // Once herdr stops reporting Working, the unpaired call has no result.
    const settled = reducer.transcript(IDLE);
    expect(settled.entries[settled.entries.length - 1]?.content).toMatchObject({
      value: { status: 'noResult' },
    });
    expect(settled.pendingRequests).toEqual([]);
  });

  it('merges a patch call, its end event and its output into one row', () => {
    const b = new RolloutBuilder({ dialect: 'legacy' });
    b.legacyUser('add notes'); // L1
    b.response('custom_tool_call', {
      call_id: 'call-p',
      name: 'apply_patch',
      input: '*** Begin Patch\n*** Add File: /work/notes.txt\n+hello\n*** End Patch\n',
    }); // L2
    b.event('patch_apply_end', {
      call_id: 'call-p',
      stdout: 'Success. Updated the following files:\nA notes.txt\n',
      stderr: '',
      success: true,
      changes: { '/work/notes.txt': { type: 'add', content: 'hello\n' } },
    }); // L3
    b.response('custom_tool_call_output', {
      call_id: 'call-p',
      output: 'Success. Updated the following files:\nA notes.txt\n',
    }); // L4
    const lines = b.chatLines;
    const entries = b.reducer().transcript(IDLE).entries;
    expect(entries.map((e) => e.sourceOffset)).toEqual([lines[1]?.offset, lines[2]?.offset]);
    expect(entries[1]?.content).toMatchObject({
      type: 'tool',
      value: {
        kind: 'fileWrite',
        name: 'apply_patch',
        title: 'notes.txt',
        status: 'succeeded',
        diff: { added: 1, removed: 0, files: 1 },
        callID: 'call-p',
        output: { offset: lines[4]?.offset, length: lines[4]?.length },
      },
    });
  });
});
