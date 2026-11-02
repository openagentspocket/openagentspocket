// Behavior of the Claude reducer on small hand-written transcripts (the cases the captured
// goldens do not reach): activity-dependent tool status, declines, queued prompts, local commands,
// background work, turn endings and the user-text classifier.

import { describe, expect, it } from 'vitest';
import { encodeUtf8 } from '../../events/utf8';
import { frameLines } from '../model/lines';
import { listedBackgroundWork } from '../model/transcript';
import type { ChatAgentActivity, ChatEntry, ChatToolActivity } from '../model/types';
import { projectionContext } from '../model/types';
import { ClaudeTranscriptReducer } from './reducer';
import { classifyUserText, unwrapPastedContent } from './user-text';

function transcript(records: string[], activity: ChatAgentActivity = 'idle') {
  const reducer = new ClaudeTranscriptReducer();
  reducer.append(frameLines(encodeUtf8(`${records.join('\n')}\n`)));
  return reducer.transcript(projectionContext({ activity }));
}

const find = (entries: ChatEntry[], id: string) =>
  entries.find((entry) => entry.id === id)?.content;
const tool = (entries: ChatEntry[], id: string): ChatToolActivity => {
  const content = find(entries, id);
  if (content?.type !== 'tool') throw new Error(`no tool row ${id}`);
  return content.value;
};

const prompt = (uuid: string, parent: string | null, text: string) =>
  `{"type":"user","uuid":"${uuid}","parentUuid":${parent === null ? 'null' : `"${parent}"`},"timestamp":"2026-10-06T05:50:00.000Z","message":{"role":"user","content":${JSON.stringify(text)}},"promptSource":"typed","origin":{"kind":"human"}}`;
const bashUse = (uuid: string, parent: string, call: string, command = 'touch a.txt') =>
  `{"type":"assistant","uuid":"${uuid}","parentUuid":"${parent}","message":{"id":"m-${uuid}","role":"assistant","content":[{"type":"tool_use","id":"${call}","name":"Bash","input":{"command":"${command}","description":"Make a file"}}]},"apiBlockIndex":0}`;
const result = (
  uuid: string,
  parent: string,
  call: string,
  content: string,
  isError = false,
  extra = '',
) =>
  `{"type":"user","uuid":"${uuid}","parentUuid":"${parent}","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"${call}","content":${JSON.stringify(content)},"is_error":${isError}}]}${extra}}`;

describe('tool status', () => {
  const unanswered = [prompt('p1', null, 'go'), bashUse('a1', 'p1', 'toolu_1')];

  it('an unanswered call depends on what herdr reports', () => {
    expect(tool(transcript(unanswered, 'working').entries, 'tool:toolu_1').status).toBe('running');
    expect(tool(transcript(unanswered, 'unknown').entries, 'tool:toolu_1').status).toBe('running');
    expect(tool(transcript(unanswered, 'blocked').entries, 'tool:toolu_1').status).toBe(
      'awaitingApproval',
    );
    expect(tool(transcript(unanswered, 'idle').entries, 'tool:toolu_1').status).toBe('noResult');
  });

  it('an unanswered call is a pending request until the turn ends', () => {
    const pending = transcript(unanswered, 'blocked').pendingRequests;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      entryID: 'tool:toolu_1',
      callID: 'toolu_1',
      kind: 'command',
      toolName: 'Bash',
      summary: 'touch a.txt',
      detail: 'Make a file',
    });
    const finished = [
      ...unanswered,
      '{"type":"system","subtype":"turn_duration","uuid":"t1","parentUuid":"a1","durationMs":10}',
    ];
    expect(transcript(finished, 'idle').pendingRequests).toEqual([]);
    expect(tool(transcript(finished, 'working').entries, 'tool:toolu_1').status).toBe('noResult');
  });

  it('a result succeeds, fails with an exit code, or is declined with the user feedback', () => {
    const ok = transcript([
      ...unanswered,
      result('r1', 'a1', 'toolu_1', 'done', false, ',"toolUseResult":{"stdout":"done"}'),
    ]);
    expect(tool(ok.entries, 'tool:toolu_1')).toMatchObject({
      status: 'succeeded',
      title: 'Make a file',
      subtitle: 'touch a.txt',
      preview: { text: 'done' },
    });

    const failed = transcript([
      ...unanswered,
      result('r1', 'a1', 'toolu_1', 'Exit code 2\nboom', true),
    ]);
    expect(tool(failed.entries, 'tool:toolu_1')).toMatchObject({ status: 'failed', exitCode: 2 });

    const declined = transcript([
      ...unanswered,
      result(
        'r1',
        'a1',
        'toolu_1',
        "The user doesn't want to proceed with this tool use. The tool use was rejected.\nthe user said:\nuse a dry run",
        true,
      ),
    ]);
    expect(tool(declined.entries, 'tool:toolu_1')).toMatchObject({
      status: 'declined',
      note: 'use a dry run',
      preview: null,
    });
  });

  it('an interrupted result absorbs the interrupt marker that follows it', () => {
    const records = [
      ...unanswered,
      result('r1', 'a1', 'toolu_1', '[Request interrupted by user for tool use]', true),
      '{"type":"user","uuid":"i1","parentUuid":"r1","message":{"role":"user","content":[{"type":"text","text":"[Request interrupted by user for tool use]"}]}}',
    ];
    const t = transcript(records);
    expect(tool(t.entries, 'tool:toolu_1').status).toBe('interrupted');
    expect(t.entries.map((entry) => entry.id)).toEqual(['user:p1', 'tool:toolu_1']);
  });
});

describe('prompts and turns', () => {
  it('a typed prompt is a user message, a turn opens and turn_duration closes it', () => {
    const t = transcript([
      prompt('p1', null, 'hello'),
      '{"type":"assistant","uuid":"a1","parentUuid":"p1","timestamp":"2026-10-06T05:50:02.000Z","message":{"id":"m1","role":"assistant","content":[{"type":"text","text":"hi"}]},"apiBlockIndex":0}',
      '{"type":"system","subtype":"turn_duration","uuid":"t1","parentUuid":"a1","timestamp":"2026-10-06T05:50:03.000Z","durationMs":3000}',
    ]);
    expect(t.entries.map((entry) => entry.id)).toEqual(['user:p1', 'text:a1']);
    expect(t.turns).toEqual([
      {
        firstEntryID: 'user:p1',
        startedAt: '2026-10-06T05:50:00.000Z',
        endedAt: '2026-10-06T05:50:03.000Z',
        ending: 'completed',
      },
    ]);
    expect(t.latestPromptOffset).toBe(0);
  });

  it('an API error ends the turn as failed, a retry that answers clears it', () => {
    const records = (answer: boolean) => [
      prompt('p1', null, 'hello'),
      '{"type":"assistant","uuid":"e1","parentUuid":"p1","isApiErrorMessage":true,"message":{"id":"m1","role":"assistant","content":[{"type":"text","text":"API Error: overloaded"}]},"apiBlockIndex":0}',
      ...(answer
        ? [
            '{"type":"assistant","uuid":"a1","parentUuid":"e1","message":{"id":"m2","role":"assistant","content":[{"type":"text","text":"hi"}]},"apiBlockIndex":0}',
          ]
        : []),
      `{"type":"system","subtype":"turn_duration","uuid":"t1","parentUuid":"${answer ? 'a1' : 'e1'}","durationMs":1}`,
    ];
    const failed = transcript(records(false));
    expect(failed.turns[0]?.ending).toBe('failed');
    expect(find(failed.entries, 'notice:e1')).toMatchObject({
      type: 'notice',
      value: { kind: 'error', title: 'API Error: overloaded' },
    });
    expect(transcript(records(true)).turns[0]?.ending).toBe('completed');
  });

  it('a prompt waiting in the queue shows as a bubble while the Agent works, and stops once delivered', () => {
    const base = [prompt('p1', null, 'first'), bashUse('a1', 'p1', 'toolu_1')];
    const queued =
      '{"type":"queue-operation","operation":"enqueue","timestamp":"2026-10-06T05:50:01.000Z","content":"second please"}';
    const working = transcript([...base, queued], 'working');
    const bubble = working.entries.find((entry) => entry.id.startsWith('queued:'));
    expect(bubble?.content).toMatchObject({
      type: 'user',
      value: { text: 'second please', wasQueued: true },
    });
    expect([...working.unrecordedEntryIDs]).toEqual([bubble?.id]);
    expect(working.recordedPrompts.map((p) => p.text)).toEqual(['first', 'second please']);
    expect(
      transcript(
        [
          ...base,
          '{"type":"system","subtype":"turn_duration","uuid":"t1","parentUuid":"a1","durationMs":1}',
          queued,
        ],
        'idle',
      ).entries.some((entry) => entry.id.startsWith('queued:')),
    ).toBe(false);
    const delivered = transcript([...base, queued, prompt('p2', 'a1', 'second please')], 'working');
    expect(delivered.entries.some((entry) => entry.id.startsWith('queued:'))).toBe(false);
    expect(
      delivered.recordedPrompts.find((p) => p.text === 'second please' && p.offset > 0),
    ).toBeDefined();
  });

  it('a slash command with local output is one notice', () => {
    const t = transcript([
      '{"type":"user","uuid":"c1","parentUuid":null,"message":{"role":"user","content":"<command-name>/cost</command-name><command-args></command-args>"}}',
      '{"type":"user","uuid":"o1","parentUuid":"c1","message":{"role":"user","content":"<local-command-stdout>Total cost: $1</local-command-stdout>"}}',
    ]);
    expect(t.entries.map((entry) => entry.id)).toEqual(['notice:c1']);
    expect(find(t.entries, 'notice:c1')).toMatchObject({
      value: { kind: 'command', title: '/cost', detail: 'Total cost: $1' },
    });
  });

  it('a bash input line becomes a shell notice with its output', () => {
    const t = transcript([
      '{"type":"user","uuid":"c1","parentUuid":null,"message":{"role":"user","content":"<bash-input>ls</bash-input>"}}',
      '{"type":"user","uuid":"o1","parentUuid":"c1","message":{"role":"user","content":"<bash-stdout>a.txt</bash-stdout><bash-stderr></bash-stderr>"}}',
    ]);
    expect(find(t.entries, 'notice:c1')).toMatchObject({
      value: { kind: 'shellCommand', title: 'ls', detail: 'a.txt' },
    });
  });
});

describe('background work', () => {
  const launch = [
    prompt('p1', null, 'go'),
    '{"type":"assistant","uuid":"a1","parentUuid":"p1","timestamp":"2026-10-06T05:50:00.000Z","message":{"id":"m1","role":"assistant","content":[{"type":"tool_use","id":"toolu_ag","name":"Agent","input":{"description":"Run it","subagent_type":"general-purpose"}}]},"apiBlockIndex":0}',
    result(
      'r1',
      'a1',
      'toolu_ag',
      'Async agent launched',
      false,
      ',"toolUseResult":{"status":"async_launched","agentId":"abc123"}',
    ),
  ];
  const notification =
    '{"type":"user","uuid":"n1","parentUuid":"r1","timestamp":"2026-10-06T05:51:00.000Z","message":{"role":"user","content":"<task-notification><task-id>t</task-id><tool-use-id>toolu_ag</tool-use-id><status>completed</status><summary>Done</summary><result>All good</result><usage><subagent_tokens>10</subagent_tokens><tool_uses>2</tool_uses><duration_ms>5</duration_ms></usage></task-notification>"}}';

  it('a launched subagent runs until its notification arrives', () => {
    const running = transcript(launch, 'working');
    expect(running.backgroundWork).toMatchObject([
      {
        id: 'toolu_ag',
        kind: 'subagent',
        title: 'Run it',
        subtitle: 'general-purpose',
        state: 'running',
      },
    ]);
    expect(tool(running.entries, 'tool:toolu_ag').status).toBe('running');
    const done = transcript([...launch, notification], 'idle');
    expect(done.backgroundWork[0]).toMatchObject({
      state: 'completed',
      usage: { tokens: 10, toolUses: 2, durationMilliseconds: 5 },
    });
    expect(tool(done.entries, 'tool:toolu_ag')).toMatchObject({
      status: 'succeeded',
      preview: { text: 'All good' },
    });
    expect(done.backgroundWorkEnds.toolu_ag?.state).toBe('completed');
    expect(find(done.entries, 'notice:n1')).toMatchObject({
      value: { kind: 'taskNotification', title: 'Done' },
    });
  });

  it('the subagent id names its own transcript only when it is a safe path component', () => {
    expect(tool(transcript(launch).entries, 'tool:toolu_ag').subagentAgentID).toBe('abc123');
    const unsafe = launch.map((line) => line.replace('abc123', '../x'));
    expect(tool(transcript(unsafe).entries, 'tool:toolu_ag').subagentAgentID).toBeNull();
  });

  it('stop-all ends running work', () => {
    const killed =
      '{"type":"system","subtype":"agents_killed","uuid":"k1","parentUuid":"r1","timestamp":"2026-10-06T05:52:00.000Z"}';
    const t = transcript([...launch, killed]);
    expect(t.backgroundWork[0]?.state).toBe('stopped');
    expect(listedBackgroundWork(t)).toHaveLength(1);
  });
});

describe('records the reducer cannot read', () => {
  it('counts invalid and unknown lines and never throws', () => {
    const t = transcript([
      'not json',
      '{"type":"mystery","uuid":"m1","parentUuid":null}',
      '{"type":"future-metadata"}',
      '{"type":"system","subtype":"brand_new","uuid":"s1","parentUuid":null}',
      prompt('p1', null, 'hello'),
    ]);
    expect(t.diagnostics.invalidLines).toBe(1);
    expect([...t.diagnostics.unknownRecordTypes].sort()).toEqual([
      'future-metadata',
      'mystery',
      'system/brand_new',
    ]);
    expect(t.entries.map((entry) => entry.id)).toEqual(['user:p1']);
  });

  it('keeps the latest title and the context usage of the newest assistant message', () => {
    const t = transcript([
      '{"type":"ai-title","aiTitle":"First"}',
      '{"type":"custom-title","customTitle":"Mine"}',
      prompt('p1', null, 'hello'),
      '{"type":"assistant","uuid":"a1","parentUuid":"p1","message":{"id":"m1","model":"claude-opus[1m]","role":"assistant","usage":{"input_tokens":10,"cache_read_input_tokens":90000,"cache_creation_input_tokens":5},"content":[{"type":"text","text":"hi"}]},"apiBlockIndex":0}',
    ]);
    expect(t.title).toBe('Mine');
    expect(t.contextUsage).toEqual({ usedTokens: 90015, windowTokens: 1_000_000 });
  });
});

describe('user text', () => {
  it('classifies commands, shell lines, hidden reminders and teammate messages', () => {
    expect(classifyUserText('plain')).toEqual({ type: 'prompt', text: 'plain' });
    expect(classifyUserText('<command-name>/clear</command-name>')).toMatchObject({
      type: 'command',
      invocation: { name: 'clear' },
    });
    expect(classifyUserText('<system-reminder>x</system-reminder>')).toEqual({ type: 'hidden' });
    expect(classifyUserText('<bash-stdout>a &lt; b</bash-stdout>')).toEqual({
      type: 'bashOutput',
      text: 'a < b',
    });
    const external = classifyUserText(
      '<teammate-message teammate_id="bob">hello</teammate-message>',
    );
    expect(external).toEqual({ type: 'external', messages: ['Message from @bob\nhello'] });
  });

  it('unwraps pasted content', () => {
    const wrapped =
      'see\n\n<pasted_content id="ab12">\nline1\nline2\n</pasted_content id="ab12">\nthanks';
    // The paste joins the text around it, dropping up to two newlines on each side.
    expect(unwrapPastedContent(wrapped)).toBe('seeline1\nline2thanks');
    expect(unwrapPastedContent('no paste')).toBe('no paste');
  });
});
