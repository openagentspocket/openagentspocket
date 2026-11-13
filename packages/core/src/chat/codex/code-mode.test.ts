// Commands Codex runs through code mode (`exec` calling `tools.exec_command`), read from real
// rollouts (goldens/codex/transcripts, Codex 0.16x): each state a command can end in, and the
// CommandExecution twin that stands for a command that ran.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { goldenImage } from '../golden-image';
import { frameLines } from '../model/lines';
import { type ChatAgentActivity, projectionContext } from '../model/types';
import { toolLine } from '../timeline/tool-line';
import { CodexRolloutReducer } from './reducer';
import { RolloutBuilder } from './test-builder';
import * as summary from './tool-summary';

const DIRECTORY = join(__dirname, '../../../goldens/codex/transcripts');

function commandRows(fixture: string, activity: ChatAgentActivity = 'idle') {
  const reducer = new CodexRolloutReducer('rollout');
  reducer.append(frameLines(new Uint8Array(readFileSync(join(DIRECTORY, fixture)))));
  const transcript = reducer.transcript(projectionContext({ activity }));
  return transcript.entries.flatMap((entry) =>
    entry.content.type === 'tool' && entry.content.value.kind === 'command'
      ? [{ ...entry.content.value, isPortOnly: entry.isPortOnly === true }]
      : [],
  );
}

describe('code-mode commands', () => {
  it('reads the command lines a script runs', () => {
    const call = 'tools.exec_command(';
    expect(
      summary.codeModeCommands('text(await tools.exec_command({cmd:"ls -la"}));', call),
    ).toEqual(['ls -la']);
    expect(
      summary.codeModeCommands(
        'await Promise.all([tools.exec_command({ "cmd": "a \\"b\\"" }), tools.exec_command({workdir:"/w", cmd:\'c\'})]);',
        call,
      ),
    ).toEqual(['a "b"', 'c']);
    expect(summary.codeModeCommands('tools.exec_command({cmd: line})', call)).toEqual([]);
    expect(summary.codeModeCommands('tools.write_stdin({session_id: 1})', call)).toEqual([]);
  });

  it('shows a command the sandbox refused as failed, and the approved run as its own row', () => {
    const rows = commandRows('probe1-rollout.jsonl');
    expect(
      rows.map(({ title, name, status, exitCode }) => [title, name, status, exitCode]),
    ).toEqual([
      ['touch heeler-probe.txt', 'exec_command', 'failed', 1],
      ['touch heeler-probe.txt', 'CommandExecution', 'succeeded', 0],
      ['touch heeler-probe-2.txt', 'exec_command', 'failed', 1],
      ['touch heeler-probe-2.txt', 'exec_command', 'declined', null],
    ]);
    expect(rows[0]?.preview?.text).toContain('Operation not permitted');
    expect(rows.map((row) => row.isPortOnly)).toEqual([true, false, true, true]);
  });

  it('reads like every other command row: the command as its quiet line, no purpose', () => {
    const [refused] = commandRows('probe1-rollout.jsonl');
    expect(refused?.purpose).toBeNull();
    expect(refused?.command).toBeNull();
    expect(refused && toolLine(refused)).toEqual({
      title: 'touch heeler-probe.txt',
      isCommand: true,
      command: null,
    });
  });

  it('leaves a command that ran to its CommandExecution, parallel runs included', () => {
    const rows = commandRows('probe2-rollout.jsonl');
    expect(rows.map(({ title, name, status }) => [title, name, status])).toEqual([
      ['touch x1.txt', 'CommandExecution', 'succeeded'],
      ['sleep 40', 'CommandExecution', 'succeeded'],
      ['touch x5-narrow-probe-file.txt', 'exec_command', 'declined'],
      ['touch par-c.txt', 'CommandExecution', 'succeeded'],
      ['touch par-d.txt', 'CommandExecution', 'succeeded'],
    ]);
  });

  it('keeps a command still running after its script yielded open', () => {
    const builder = new RolloutBuilder();
    builder.turnStarted('turn-1');
    builder.userMessage('turn-1', 'u1', 'Wait a bit');
    builder.response('custom_tool_call', {
      call_id: 'call-sleep',
      name: 'exec',
      input: 'text(await tools.exec_command({cmd:"sleep 40",yield_time_ms:1000}));',
      internal_chat_message_metadata_passthrough: { turn_id: 'turn-1' },
    });
    builder.response('custom_tool_call_output', {
      call_id: 'call-sleep',
      output: 'Script completed\nWall time 1.0 seconds\nOutput:\n{"session_id":7,"output":""}',
    });
    const reducer = builder.reducer();
    const open = reducer.transcript(projectionContext({ activity: 'working' })).entries.at(-1);
    expect(open?.content.type === 'tool' && open.content.value.status).toBe('running');
  });

  it('shows a finished script with its exit code and output', () => {
    const builder = new RolloutBuilder();
    builder.turnStarted('turn-1');
    builder.userMessage('turn-1', 'u1', 'List');
    builder.response('custom_tool_call', {
      call_id: 'call-ls',
      name: 'exec',
      input:
        'const r = await tools.exec_command({cmd:"ls missing"}); text(r.output); text(`exit_code=${r.exit_code}`);',
      internal_chat_message_metadata_passthrough: { turn_id: 'turn-1' },
    });
    builder.response('custom_tool_call_output', {
      call_id: 'call-ls',
      output:
        'Script completed\nWall time 0.1 seconds\nOutput:\nls: missing: No such file\nexit_code=2',
    });
    const row = builder
      .reducer()
      .transcript(projectionContext({ activity: 'idle' }))
      .entries.at(-1);
    const tool = row?.content.type === 'tool' ? row.content.value : null;
    expect([tool?.status, tool?.exitCode, tool?.preview?.text]).toEqual([
      'failed',
      2,
      'ls: missing: No such file',
    ]);
  });

  it('leaves the Swift goldens unchanged: these rows are this port’s', () => {
    const reducer = new CodexRolloutReducer('rollout');
    reducer.append(
      frameLines(new Uint8Array(readFileSync(join(DIRECTORY, 'probe2-rollout.jsonl')))),
    );
    const image = goldenImage(reducer.transcript(projectionContext({ activity: 'idle' }))) as {
      entries: unknown[];
    };
    expect(JSON.stringify(image.entries)).not.toContain('"exec_command"');
  });
});
