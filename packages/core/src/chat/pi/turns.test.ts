// Skills, approvals, questions, steering, errors and summaries of Pi and Oh My Pi.

import { describe, expect, it } from 'vitest';
import { PiTranscriptReducer } from './reducer';
import {
  fixture,
  HEADER,
  lines,
  ompTranscript,
  project,
  reduce,
  text,
  toolOf,
  user,
} from './reducer.testkit';

describe('skills, approvals and questions', () => {
  const skillTurn = [
    HEADER,
    user('u1', null, 'hello'),
    '{"type":"message","id":"a1","parentId":"u1","message":{"role":"assistant","content":[{"type":"text","text":"hi"}],"stopReason":"stop"}}',
    '{"type":"custom_message","customType":"skill-prompt","content":"SKILL BODY","display":true,"details":{"name":"probe","args":"from chat","prompt":"/skill:probe from chat"},"attribution":"user","id":"s1","parentId":"a1"}',
    '{"type":"message","id":"a2","parentId":"s1","message":{"role":"assistant","content":[{"type":"toolCall","id":"call_1|fc_1","name":"bash","arguments":{"i":"Probing","command":"echo probe"}}],"stopReason":"toolUse"}}',
  ];

  it('opens a turn for an OMP skill prompt and records the prompt', () => {
    const { transcript } = reduce(skillTurn, 'pi', 'working');
    expect(transcript.entries[2]?.content).toMatchObject({
      type: 'user',
      value: { text: '/probe from chat', command: { name: 'probe', arguments: 'from chat' } },
    });
    expect(transcript.entries[2]?.id).toBe('pi:s1');
    expect(transcript.turns.map((turn) => turn.firstEntryID)).toEqual(['pi:u1', 'pi:s1']);
    expect(transcript.turns[0]?.ending).toBe('completed');
    expect(transcript.turns[1]?.ending).toBeNull();
    expect(transcript.recordedPrompts.map((prompt) => prompt.text)).toEqual([
      'hello',
      '/skill:probe from chat',
    ]);
    expect(JSON.stringify(transcript.entries)).not.toContain('SKILL BODY');
    expect(toolOf(transcript)?.status).toBe('running');
  });

  it('shows a skill prompt mid-sentence, without a prompt or from the agent as it is', () => {
    const entry = (fields: string) =>
      reduce([
        HEADER,
        `{"type":"custom_message","customType":"skill-prompt","content":"SKILL BODY","display":true,"id":"s","parentId":null,${fields}}`,
      ]).transcript.entries[0]?.content;
    expect(
      entry('"attribution":"user","details":{"name":"probe","prompt":"please /skill:probe now"}'),
    ).toMatchObject({ type: 'user', value: { text: 'please /skill:probe now', command: null } });
    const hook = {
      type: 'notice',
      value: { kind: 'hook', title: 'skill-prompt', detail: 'SKILL BODY' },
    };
    expect(entry('"attribution":"user","details":{"name":"probe"}')).toMatchObject(hook);
    expect(
      entry('"attribution":"agent","details":{"name":"probe","prompt":"/skill:probe"}'),
    ).toMatchObject(hook);
  });

  it('makes a blocked tool in a skill turn pending', () => {
    const { transcript } = reduce(skillTurn, 'pi', 'blocked');
    expect(toolOf(transcript)?.status).toBe('awaitingApproval');
    expect(toolOf(transcript)?.subtitle).toBeNull();
    expect(transcript.pendingRequests).toEqual([
      {
        entryID: 'pi:tool:call_1|fc_1',
        callID: 'call_1|fc_1',
        kind: 'command',
        toolName: 'bash',
        summary: 'echo probe',
        detail: null,
        questions: [],
        planFilePath: null,
      },
    ]);
  });

  it('shows a Pi skill block as a command and records the echo', () => {
    const content = (value: string) => {
      const { transcript } = reduce([HEADER, user('u', null, value)]);
      return [transcript.entries[0]?.content, transcript.recordedPrompts[0]?.text] as const;
    };
    const block = '<skill name="hello" location="/p/SKILL.md">\nBody line\n</skill>';
    expect(content(block)).toEqual([
      {
        type: 'user',
        value: {
          text: '/hello',
          imageCount: 0,
          attachmentLabels: [],
          command: { name: 'hello', arguments: '' },
          wasQueued: false,
        },
      },
      '/skill:hello',
    ]);
    const [multiline, prompt] = content(`${block}\n\nfirst\n\nsecond </skill>`);
    expect(multiline).toMatchObject({
      value: {
        text: '/hello first\n\nsecond </skill>',
        command: { name: 'hello', arguments: 'first\n\nsecond </skill>' },
      },
    });
    expect(prompt).toBe('/skill:hello first\n\nsecond </skill>');
    const unclosed = '<skill name="hello" location="/p/SKILL.md">\nBody line\n\nargs';
    expect(content(unclosed)).toMatchObject([
      { value: { text: unclosed, command: null } },
      unclosed,
    ]);
  });

  it('carries the questions of a pending OMP ask', () => {
    const transcript = ompTranscript(37, 'blocked');
    const request = transcript.pendingRequests[0];
    expect(transcript.pendingRequests).toHaveLength(1);
    expect(request?.callID).toContain('|');
    expect([request?.kind, request?.toolName, request?.summary]).toEqual([
      'question',
      'ask',
      'Pick a fruit',
    ]);
    expect(request?.questions.map((q) => [q.id, q.text, q.options.map((o) => o.label)])).toEqual([
      ['fruit', 'Pick a fruit', ['apple', 'pear']],
      ['size', 'Pick a size', ['small', 'large']],
    ]);
    const { transcript: detailed } = reduce(
      [
        HEADER,
        '{"type":"message","id":"a","parentId":null,"message":{"role":"assistant","content":[{"type":"toolCall","id":"c","name":"ask","arguments":{"questions":[{"id":"q","question":"Which?","header":"Pick","options":[{"label":"one","description":"First"},{"label":"two"}],"multi":true,"recommended":1}]}}],"stopReason":"toolUse"}}',
      ],
      'pi',
      'blocked',
    );
    expect(detailed.pendingRequests[0]?.questions).toEqual([
      {
        id: 'q',
        header: 'Pick',
        text: 'Which?',
        options: [
          { label: 'one', detail: 'First' },
          { label: 'two', detail: null },
        ],
        isMultiSelect: true,
        recommendedIndex: 1,
        answer: null,
        queuedAnswer: null,
      },
    ]);
  });

  it('reads a denied approval and a cancelled ask as declined', () => {
    const denied = ompTranscript(28);
    expect(toolOf(denied, 'call_adb504f6')?.status).toBe('succeeded');
    expect(toolOf(denied, 'call_74e0dc7b')?.status).toBe('declined');
    expect(toolOf(denied, 'call_fd940fe8')?.status).toBe('declined');
    expect(denied.pendingRequests).toEqual([]);
    const cancelled = ompTranscript(39);
    const ask = toolOf(cancelled, 'call_7bfdda8a');
    expect(ask?.status).toBe('declined');
    expect(ask?.questions.every((q) => q.answer === null)).toBe(true);
    expect(cancelled.entries.at(-1)?.content).toMatchObject({
      type: 'notice',
      value: { kind: 'interrupted', title: 'Interrupted' },
    });
    expect(cancelled.turns.at(-1)?.ending).toBe('interrupted');
  });

  it('records the answer of an answered ask', () => {
    const full = ompTranscript();
    expect(toolOf(full, 'call_c20d8fdc')?.questions.map((q) => [q.id, q.answer])).toEqual([
      ['fruit', 'pear'],
    ]);
    expect(toolOf(full, 'call_a97f9e92')?.questions[0]?.answer).toBe('red');
    const { transcript } = reduce([
      HEADER,
      '{"type":"message","id":"a","parentId":null,"message":{"role":"assistant","content":[{"type":"toolCall","id":"c","name":"ask","arguments":{"questions":[{"id":"one","question":"First?","options":[{"label":"x"},{"label":"y"}]},{"id":"two","question":"Second?","options":[{"label":"p"},{"label":"q"}],"multi":true}]}}],"stopReason":"toolUse"}}',
      '{"type":"message","id":"r","parentId":"a","message":{"role":"toolResult","toolCallId":"c","toolName":"ask","content":[{"type":"text","text":"User answers"}],"details":{"results":[{"id":"two","selectedOptions":["p","q"]},{"id":"one","selectedOptions":["y"]}]},"isError":false}}',
    ]);
    expect(toolOf(transcript)?.questions.map((q) => q.answer)).toEqual(['y', 'p, q']);
  });

  it('shows a plan proposal as ready for review, not interrupted', () => {
    const transcript = ompTranscript();
    const end = transcript.entries.find((entry) => entry.id === 'pi:c2d14183:end');
    expect(end?.content).toMatchObject({
      type: 'notice',
      value: { kind: 'system', title: 'Plan ready for review' },
    });
    expect(transcript.entries.at(-1)?.id).toBe(end?.id);
    expect(transcript.turns.at(-1)?.ending).toBe('completed');
    expect(transcript.diagnostics.unknownRecordTypes.size).toBe(0);
    expect(transcript.needsOlderHistory).toBe(false);
    const { transcript: silent } = reduce([
      HEADER,
      user('u', null, 'go'),
      '{"type":"message","id":"e","parentId":"u","message":{"role":"assistant","content":[],"stopReason":"aborted","errorMessage":"__omp.silent_abort__"}}',
    ]);
    expect(silent.entries).toHaveLength(1);
    expect(silent.turns.at(-1)?.ending).toBe('completed');
  });

  it('shows no row or file for the plan hand-off write', () => {
    const transcript = ompTranscript();
    const tools = transcript.entries.flatMap((entry) =>
      entry.content.type === 'tool' ? [entry.content.value] : [],
    );
    expect(tools.some((tool) => tool.title.includes('xd://'))).toBe(false);
    expect(tools.some((tool) => tool.callID?.startsWith('call_98595df0'))).toBe(false);
    expect(tools.filter((tool) => tool.kind === 'fileWrite').map((tool) => tool.title)).toEqual([
      'local://append-plan-ok-plan.md',
    ]);
    // The result alone, its call above the lines read, shows nothing either.
    const reducer = new PiTranscriptReducer('omp');
    reducer.append(fixture('omp/transcripts/approvals-asks-plan.jsonl').slice(54));
    expect(toolOf(project(reducer, 'unknown', 1), 'call_98595df0')).toBeUndefined();
  });

  it('shows a device write as its tool', () => {
    const call =
      '{"type":"message","id":"a","parentId":"u","message":{"role":"assistant","content":[{"type":"toolCall","id":"c","name":"write","arguments":{"path":"xd://generate_image","content":"{\\"prompt\\":\\"a red fox\\"}"}}],"stopReason":"toolUse"}}';
    const head = [HEADER, user('u', null, [text('draw a fox')]), call];
    expect(
      reduce(head, 'omp', 'blocked').transcript.pendingRequests.map((request) => request.toolName),
    ).toEqual(['generate_image']);
    const result =
      '{"type":"message","id":"r","parentId":"a","message":{"role":"toolResult","toolCallId":"c","toolName":"write","content":[{"type":"text","text":"Image saved"}],"details":{"xdev":{"tool":"generate_image","mode":"execute"}},"isError":false}}';
    const tool = toolOf(reduce([...head, result], 'omp', 'idle').transcript, 'c');
    expect([tool?.kind, tool?.name, tool?.title, tool?.status]).toEqual([
      'other',
      'generate_image',
      'generate_image',
      'succeeded',
    ]);
    expect(tool?.fileChanges).toBeNull();
    expect(tool?.preview?.text).toBe('Image saved');
    const paged = new PiTranscriptReducer('omp');
    paged.append(lines([HEADER, result]));
    expect(toolOf(project(paged, 'unknown', 1), 'c')?.name).toBe('generate_image');
  });
});

describe('steering, interruptions and errors', () => {
  const steerRows = [
    HEADER,
    user('u', null, 'start'),
    '{"type":"message","id":"a1","parentId":"u","message":{"role":"assistant","content":[{"type":"toolCall","id":"c1","name":"bash","arguments":{"command":"ls"}}],"stopReason":"toolUse"}}',
    '{"type":"message","id":"r1","parentId":"a1","timestamp":"2026-10-15T17:54:17.461Z","message":{"role":"toolResult","toolCallId":"c1","toolName":"bash","content":[{"type":"text","text":"a.txt"}],"isError":false}}',
    user('s', 'r1', 'steer', ',"timestamp":"2026-10-15T17:54:17.462Z"'),
    '{"type":"message","id":"a2","parentId":"s","message":{"role":"assistant","content":[{"type":"toolCall","id":"c2","name":"bash","arguments":{"command":"pwd"}}],"stopReason":"toolUse"}}',
    '{"type":"message","id":"r2","parentId":"a2","message":{"role":"toolResult","toolCallId":"c2","toolName":"bash","content":[{"type":"text","text":"/p"}],"isError":false}}',
    '{"type":"message","id":"a3","parentId":"r2","message":{"role":"assistant","content":[{"type":"text","text":"done"}],"stopReason":"stop"}}',
  ];

  it('keeps a Pi steer in the running turn', () => {
    const { transcript: running } = reduce(steerRows.slice(0, 6), 'pi', 'working');
    expect(running.turns.map((turn) => turn.firstEntryID)).toEqual(['pi:u']);
    expect(running.turns[0]?.ending).toBeNull();
    expect(running.entries.find((entry) => entry.id === 'pi:s')?.content).toMatchObject({
      type: 'user',
      value: { text: 'steer', wasQueued: true },
    });
    expect(running.recordedPrompts.map((prompt) => prompt.text)).toEqual(['start', 'steer']);
    expect(running.latestPromptOffset).toBe(running.entries[0]?.sourceOffset);
    expect(toolOf(running, 'c2')?.status).toBe('running');
    const done = reduce(steerRows).transcript;
    expect(done.turns).toHaveLength(1);
    expect(done.turns[0]?.ending).toBe('completed');
    // A prompt after a reply that broke off unrecorded opens a turn of its own.
    const { transcript: restarted } = reduce(
      [
        HEADER,
        user('u', null, 'start'),
        '{"type":"message","id":"a","parentId":"u","message":{"role":"assistant","content":[{"type":"text","text":"partial"}]}}',
        user('n', 'a', 'next'),
      ],
      'pi',
      'working',
    );
    expect(restarted.turns.map((turn) => turn.ending)).toEqual(['interrupted', null]);
  });

  it('opens a turn for a prompt after a resumed tool turn', () => {
    const start = user('u', null, 'start');
    const call =
      '{"type":"message","id":"a","parentId":"u","timestamp":"2026-10-15T17:54:17.000Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"c","name":"bash","arguments":{"command":"make"}}],"stopReason":"toolUse"}}';
    const result =
      '{"type":"message","id":"r","parentId":"a","timestamp":"2026-10-15T17:54:18.000Z","message":{"role":"toolResult","toolCallId":"c","toolName":"bash","content":[{"type":"text","text":"ok"}],"isError":false}}';
    const prompt = (parent: string) =>
      user('n', parent, 'are you there?', ',"timestamp":"2026-10-15T17:56:40.000Z"');
    for (const program of ['pi', 'omp'] as const) {
      for (const activity of ['working', 'blocked'] as const) {
        const { transcript } = reduce([HEADER, start, call, prompt('a')], program, activity);
        expect(transcript.turns.map((turn) => turn.ending)).toEqual(['interrupted', null]);
        expect(toolOf(transcript, 'c')?.status).toBe('interrupted');
        expect(transcript.pendingRequests).toEqual([]);
      }
      const { transcript: resumed } = reduce(
        [HEADER, start, call, result, prompt('r')],
        program,
        'working',
      );
      expect(resumed.turns.map((turn) => turn.ending)).toEqual(['interrupted', null]);
    }
    // Oh My Pi flags its steers, so an unflagged prompt written right after a tool result is not one.
    const { transcript: omp } = reduce(
      [
        HEADER,
        start,
        call,
        result,
        user('n', 'r', 'next', ',"timestamp":"2026-10-15T17:54:18.001Z"'),
      ],
      'omp',
      'working',
    );
    expect(omp.turns.map((turn) => turn.ending)).toEqual(['interrupted', null]);
  });

  it('keeps a flagged OMP steer in its turn', () => {
    const denied = ompTranscript(18);
    const steer = denied.entries.find((entry) => entry.id === 'pi:9fb8c963');
    expect(steer?.content).toMatchObject({ type: 'user', value: { text: 'abc', wasQueued: true } });
    expect(denied.turns.at(-1)?.firstEntryID).toBe('pi:e95de799');
    expect(denied.turns.at(-1)?.ending).toBe('completed');
    expect(denied.recordedPrompts.at(-1)?.text).toBe('abc');
    const full = ompTranscript();
    expect(full.entries.find((entry) => entry.id === 'pi:62cc28b8')?.content).toMatchObject({
      value: { text: 'my draft text', wasQueued: true },
    });
    expect(full.turns.some((turn) => turn.firstEntryID === 'pi:62cc28b8')).toBe(false);
    expect(full.turns.find((turn) => turn.firstEntryID === 'pi:ceec44cf')?.ending).toBe(
      'completed',
    );
    const { transcript: running } = reduce(
      [
        HEADER,
        user('u', null, 'start'),
        '{"type":"message","id":"a","parentId":"u","message":{"role":"assistant","content":[{"type":"toolCall","id":"c","name":"bash","arguments":{"command":"sleep 9"}}],"stopReason":"toolUse"}}',
        '{"type":"message","id":"s","parentId":"a","message":{"role":"user","content":"hurry","steering":true}}',
      ],
      'omp',
      'working',
    );
    expect(toolOf(running, 'c')?.status).toBe('running');
    expect(running.turns).toHaveLength(1);
  });

  it('shows a provider error, and keeps the turn running through a retry', () => {
    const auth = fixture('pi/transcripts/auth-error-skill.jsonl');
    const failed = new PiTranscriptReducer();
    failed.append(auth.slice(0, 5));
    const transcript = project(failed);
    expect(transcript.entries.at(-1)?.content).toMatchObject({
      type: 'notice',
      value: {
        kind: 'error',
        title: 'Agent error',
        detail:
          'OAuth refresh failed for xai: xAI OAuth token refresh failed (HTTP 400): invalid_grant: Invalid or unknown refresh token',
      },
    });
    expect(transcript.turns.at(-1)?.ending).toBe('failed');
    const retry = fixture('pi/transcripts/provider-retry.jsonl');
    const reducer = new PiTranscriptReducer();
    reducer.append(retry.slice(0, 5));
    const retrying = project(reducer, 'working');
    expect(retrying.turns).toHaveLength(1);
    expect(retrying.turns[0]?.ending).toBeNull();
    expect(retrying.entries.at(-1)?.content).toMatchObject({
      value: { detail: 'Connection error.' },
    });
    // Esc during the countdown records nothing; the Agent goes idle.
    expect(project(reducer, 'idle').turns.at(-1)?.ending).toBe('failed');
    const finished = new PiTranscriptReducer();
    finished.append(retry);
    const done = project(finished, 'idle');
    expect(done.turns).toHaveLength(1);
    expect(done.turns[0]?.ending).toBe('completed');
  });
});
