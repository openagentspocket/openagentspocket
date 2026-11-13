// A Subagent continued after it ended (Claude Code `SendMessage` naming it) runs again: one row per
// agent whose state follows its latest run. Synthetic records in the shapes Claude Code writes.

import { describe, expect, it } from 'vitest';
import { encodeUtf8 } from '../../events/utf8';
import { backgroundWorkOf } from '../background-work/work';
import { frameLines } from '../model/lines';
import { carryBackgroundWork, listedBackgroundWork } from '../model/transcript';
import type { ChatAgentActivity, ChatTranscript } from '../model/types';
import { projectionContext } from '../model/types';
import { ClaudeTranscriptReducer } from './reducer';

type Record = (uuid: string, parent: string | null) => object;

const at = (minute: number) => new Date(Date.UTC(2026, 9, 6, 5, minute)).toISOString();

const prompt =
  (text: string, minute: number): Record =>
  (uuid, parentUuid) => ({
    type: 'user',
    uuid,
    parentUuid,
    timestamp: at(minute),
    message: { role: 'user', content: text },
    promptSource: 'typed',
    origin: { kind: 'human' },
  });

const use =
  (call: string, name: string, input: object, minute: number): Record =>
  (uuid, parentUuid) => ({
    type: 'assistant',
    uuid,
    parentUuid,
    timestamp: at(minute),
    message: {
      id: `m-${uuid}`,
      role: 'assistant',
      content: [{ type: 'tool_use', id: call, name, input }],
    },
    apiBlockIndex: 0,
  });

const result =
  (call: string, toolUseResult: object, minute: number): Record =>
  (uuid, parentUuid) => ({
    type: 'user',
    uuid,
    parentUuid,
    timestamp: at(minute),
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: call, content: 'ok', is_error: false }],
    },
    toolUseResult,
  });

const notification =
  (agent: string, call: string | null, status: string, minute: number): Record =>
  (uuid, parentUuid) => ({
    type: 'user',
    uuid,
    parentUuid,
    timestamp: at(minute),
    message: {
      role: 'user',
      content: `<task-notification><task-id>${agent}</task-id>${
        call === null ? '' : `<tool-use-id>${call}</tool-use-id>`
      }<status>${status}</status><summary>Agent ${status} at ${minute}</summary><usage><subagent_tokens>${minute}</subagent_tokens></usage></task-notification>`,
    },
  });

const stopAll =
  (minute: number): Record =>
  (uuid, parentUuid) => ({
    type: 'system',
    subtype: 'agents_killed',
    uuid,
    parentUuid,
    timestamp: at(minute),
  });

const launch = (call: string, agent: string, minute: number): Record[] => [
  use(call, 'Agent', { description: 'Check it', subagent_type: 'general-purpose' }, minute),
  result(
    call,
    {
      agentId: agent,
      status: 'async_launched',
      description: 'Check it',
      isAsync: true,
      outputFile: '/tmp/out',
      prompt: 'Check it',
      resolvedModel: 'model',
      canContinueAgent: true,
      canReadOutputFile: true,
    },
    minute,
  ),
];

const send = (call: string, agent: string, minute: number, resumes = true): Record[] => [
  use(call, 'SendMessage', { to: agent, message: 'Go on', summary: 'Go on' }, minute),
  result(
    call,
    resumes
      ? {
          success: true,
          message: 'Resumed',
          resumedAgentId: agent,
          revivedAgentId: agent,
          pin: { id: agent, name: 'checker', ref: 'r' },
        }
      : { success: true, message: 'Queued', pin: { id: agent, name: 'checker', ref: 'r' } },
    minute,
  ),
];

/** One linear chain of `records`, as file lines. */
function lines(records: Record[]): string {
  return `${records
    .map((record, index) =>
      JSON.stringify(record(`u${index}`, index === 0 ? null : `u${index - 1}`)),
    )
    .join('\n')}\n`;
}

function read(records: Record[], activity: ChatAgentActivity = 'working'): ChatTranscript {
  const reducer = new ClaudeTranscriptReducer();
  reducer.append(frameLines(encodeUtf8(lines(records))));
  return reducer.transcript(projectionContext({ activity }));
}

/** A read of the lines from record `cut` on, carrying what a read of the lines above it listed. */
function windowed(records: Record[], cut: number): ChatTranscript {
  const all = frameLines(encodeUtf8(lines(records)));
  const windowStart = (all[cut] as { offset: number }).offset;
  const earlier = read(records.slice(0, cut));
  const reducer = new ClaudeTranscriptReducer();
  reducer.append(all.filter((line) => line.offset >= windowStart));
  const window = reducer.transcript(projectionContext({ activity: 'working', windowStart }));
  return carryBackgroundWork(
    window,
    earlier.backgroundWork,
    windowStart,
    earlier.latestPromptOffset,
  );
}

const start = [prompt('go', 0), ...launch('toolu_ag', 'ag1', 1)];

describe('a resumed subagent', () => {
  it('launch then end: ended, unchanged', () => {
    const t = read([...start, notification('ag1', 'toolu_ag', 'completed', 5)]);
    expect(t.backgroundWork).toHaveLength(1);
    expect(t.backgroundWork[0]).toMatchObject({
      id: 'toolu_ag',
      agentID: 'ag1',
      state: 'completed',
      resume: null,
      usage: { tokens: 5 },
    });
    const unsafe = read([prompt('go', 0), ...launch('toolu_ag', '../x', 1)]);
    expect(unsafe.backgroundWork[0]?.agentID).toBeNull();
  });

  it('launch, end, resume: one row, running again from the resume', () => {
    const records = [
      ...start,
      notification('ag1', 'toolu_ag', 'completed', 5),
      prompt('next', 6),
      ...send('toolu_sm', 'ag1', 7),
    ];
    const t = read(records);
    expect(t.backgroundWork).toHaveLength(1);
    const item = t.backgroundWork[0];
    expect(item).toMatchObject({
      id: 'toolu_ag',
      state: 'running',
      endOffset: null,
      usage: null,
      resume: { callID: 'toolu_sm', resumedAt: at(7) },
    });
    // Listed while running, though it first ended before the latest message.
    expect(listedBackgroundWork(t)).toHaveLength(1);
  });

  it('failed end, resume, second end: ended, listed by the second end', () => {
    const records = [
      ...start,
      notification('ag1', 'toolu_ag', 'failed', 5),
      ...send('toolu_sm', 'ag1', 7),
      notification('ag1', 'toolu_sm', 'completed', 9),
    ];
    const ended = read(records);
    expect(ended.backgroundWork[0]).toMatchObject({
      state: 'completed',
      endedAt: at(9),
      usage: { tokens: 9 },
    });
    expect(listedBackgroundWork(ended)).toHaveLength(1);
    expect(listedBackgroundWork(read([...records, prompt('later', 10)]))).toHaveLength(0);
    // A prompt between the first end and the resume does not hide the second end.
    const between = [...records.slice(0, 4), prompt('next', 6), ...records.slice(4)];
    expect(listedBackgroundWork(read(between))).toHaveLength(1);
  });

  it('two resumes: the latest run decides', () => {
    const twice = [
      ...start,
      notification('ag1', 'toolu_ag', 'completed', 5),
      ...send('toolu_sm1', 'ag1', 7),
      notification('ag1', 'toolu_sm1', 'completed', 9),
      ...send('toolu_sm2', 'ag1', 11),
    ];
    expect(read(twice).backgroundWork[0]).toMatchObject({
      state: 'running',
      resume: { callID: 'toolu_sm2' },
    });
    const ended = read([...twice, notification('ag1', 'toolu_sm2', 'failed', 13)]);
    expect(ended.backgroundWork).toHaveLength(1);
    expect(ended.backgroundWork[0]).toMatchObject({ state: 'failed', endedAt: at(13) });
  });

  it('a SendMessage to a running agent is queued, not a resume', () => {
    const queued = read([...start, ...send('toolu_sm', 'ag1', 3, false)]);
    expect(queued.backgroundWork[0]).toMatchObject({ state: 'running', resume: null });
    const afterEnd = read([
      ...start,
      ...send('toolu_sm', 'ag1', 3, false),
      notification('ag1', 'toolu_ag', 'completed', 5),
    ]);
    expect(afterEnd.backgroundWork[0]).toMatchObject({ state: 'completed', resume: null });
  });

  it('a notification naming only the agent ends the run in progress, never starts one', () => {
    const resumed = [
      ...start,
      notification('ag1', 'toolu_ag', 'completed', 5),
      ...send('toolu_sm', 'ag1', 7),
    ];
    expect(
      read([...resumed, notification('ag1', null, 'completed', 9)]).backgroundWork[0],
    ).toMatchObject({ state: 'completed', endedAt: at(9) });
    // After the run ended, it moves nothing.
    const ended = read([
      ...start,
      notification('ag1', 'toolu_ag', 'completed', 5),
      notification('ag1', null, 'completed', 9),
    ]);
    expect(ended.backgroundWork[0]).toMatchObject({ state: 'completed', endedAt: at(5) });
  });

  it('a resume whose launch is above the loaded lines runs the carried row again', () => {
    const records = [
      ...start,
      notification('ag1', 'toolu_ag', 'completed', 5),
      prompt('next', 6),
      ...send('toolu_sm', 'ag1', 7),
    ];
    const cut = 5; // the window opens at the SendMessage call
    const running = windowed(records, cut);
    expect(running.backgroundWork).toHaveLength(1);
    expect(running.backgroundWork[0]).toMatchObject({
      id: 'toolu_ag',
      state: 'running',
      resume: { callID: 'toolu_sm' },
    });
    expect(listedBackgroundWork(running)).toHaveLength(1);
    const ended = windowed([...records, notification('ag1', 'toolu_sm', 'completed', 9)], cut);
    expect(ended.backgroundWork[0]).toMatchObject({ state: 'completed', endedAt: at(9) });
    // Resumed above the window, ended inside it: the end names the resuming call.
    const resumedAbove = [
      ...records,
      prompt('more', 8),
      notification('ag1', 'toolu_sm', 'failed', 9),
    ];
    expect(windowed(resumedAbove, 8).backgroundWork[0]).toMatchObject({
      state: 'failed',
      resume: { callID: 'toolu_sm' },
    });
  });

  it('stop-all after a resume ends the resumed run', () => {
    const records = [
      ...start,
      notification('ag1', 'toolu_ag', 'completed', 5),
      ...send('toolu_sm', 'ag1', 7),
      stopAll(8),
    ];
    expect(read(records).backgroundWork[0]).toMatchObject({ state: 'stopped', endedAt: at(8) });
    expect(
      windowed([...records.slice(0, 4), prompt('next', 6), ...records.slice(4)], 5)
        .backgroundWork[0],
    ).toMatchObject({ state: 'stopped' });
    // A stop-all before the resume ended the launch run, not the resumed one.
    const stoppedFirst = read([...start, stopAll(4), ...send('toolu_sm', 'ag1', 7)]);
    expect(stoppedFirst.backgroundWork[0]).toMatchObject({ state: 'running' });
  });

  it('a resume of an agent the transcript never launched is ignored', () => {
    const t = read([prompt('go', 0), ...send('toolu_sm', 'ghost', 7)]);
    expect(t.backgroundWork).toEqual([]);
    expect(t.backgroundWorkAgents.ghost?.resume?.callID).toBe('toolu_sm');
    const other = read([...start, ...send('toolu_sm', 'ghost', 7)]);
    expect(other.backgroundWork[0]).toMatchObject({ state: 'running', resume: null });
  });

  it('staleness counts from the resume', () => {
    const t = read([
      ...start,
      notification('ag1', 'toolu_ag', 'completed', 5),
      ...send('toolu_sm', 'ag1', 50),
    ]);
    const now = Date.parse(at(50)) + 2 * 3600 * 1000;
    const work = backgroundWorkOf(t, {}, true, now, { workflowQuiet: 3600, subagentRun: 3 * 3600 });
    expect(work.rows[0]).toMatchObject({ isStale: false, lastActivity: at(50) });
  });
});
