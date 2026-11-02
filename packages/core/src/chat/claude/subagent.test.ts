// Ported from Swift ClaudeSubagentTranscriptTests.

import { describe, expect, it } from 'vitest';
import { encodeUtf8 } from '../../events/utf8';
import { FakeHostFiles } from '../model/fake-host-files';
import { frameLines } from '../model/lines';
import { type ChatToolActivity, type ChatTranscript, projectionContext } from '../model/types';
import { ClaudeTranscriptReducer } from './reducer';
import { readSubagentTranscript, subagentRoute, subagentTranscriptFrom } from './subagent';

const SESSION = '5f0c2a8e-3b1d-4c6a-9e27-8d4f1b6a0c35';
const SESSION_PATH = `/Users/developer/.claude/projects/-workspace/${SESSION}.jsonl`;
const TIME = '2026-10-31T12:00:00.000Z';

function record(fields: string, uuid: string, parent: string | null, sidechain?: string): string {
  const chain = sidechain ? `"isSidechain":true,"agentId":"${sidechain}"` : '"isSidechain":false';
  return `{"parentUuid":${parent === null ? 'null' : `"${parent}"`},${chain},${fields},"uuid":"${uuid}","timestamp":"${TIME}","cwd":"/workspace","sessionId":"${SESSION}"}`;
}

function mainTranscript(name: string, result: string | null): ChatTranscript {
  const texts = [
    record(
      `"type":"assistant","message":{"id":"m1","type":"message","role":"assistant","content":[{"type":"tool_use","id":"toolu_1","name":"${name}","input":{"description":"Find callers","subagent_type":"Explore","prompt":"Find every caller."}}]}`,
      'u1',
      null,
    ),
  ];
  if (result !== null) {
    texts.push(
      record(
        `"type":"user","message":{"role":"user","content":[{"tool_use_id":"toolu_1","type":"tool_result","content":"Done.","is_error":false}]},"toolUseResult":${result},"sourceToolAssistantUUID":"u1"`,
        'u2',
        'u1',
      ),
    );
  }
  const reducer = new ClaudeTranscriptReducer('main', SESSION_PATH);
  reducer.append(frameLines(encodeUtf8(`${texts.join('\n')}\n`)));
  return reducer.transcript(projectionContext({ activity: 'idle' }));
}

function subagentTool(transcript: ChatTranscript): ChatToolActivity | null {
  for (const entry of transcript.entries)
    if (entry.content.type === 'tool') return entry.content.value;
  return null;
}

const SUBAGENT_TEXTS = [
  record(
    '"type":"user","message":{"role":"user","content":"Find every caller."}',
    's1',
    null,
    'abc123',
  ),
  record(
    '"type":"assistant","message":{"id":"m2","type":"message","role":"assistant","content":[{"type":"text","text":"Searching."}]}',
    's2',
    's1',
    'abc123',
  ),
  record(
    '"type":"assistant","message":{"id":"m2","type":"message","role":"assistant","content":[{"type":"tool_use","id":"toolu_s1","name":"Grep","input":{"pattern":"retryPayment","path":"/workspace"}}]}',
    's3',
    's2',
    'abc123',
  ),
  record(
    '"type":"user","message":{"role":"user","content":[{"tool_use_id":"toolu_s1","type":"tool_result","content":"a.swift:1: retryPayment()","is_error":false}]},"sourceToolAssistantUUID":"s3"',
    's4',
    's3',
    'abc123',
  ),
  record(
    '"type":"assistant","message":{"id":"m3","type":"message","role":"assistant","content":[{"type":"text","text":"One caller."}]}',
    's5',
    's4',
    'abc123',
  ),
];
const SUBAGENT_DATA = encodeUtf8(`${SUBAGENT_TEXTS.join('\n')}\n`);

const hasTool = (transcript: ChatTranscript, name: string) =>
  transcript.entries.some((e) => e.content.type === 'tool' && e.content.value.name === name);
const hasText = (transcript: ChatTranscript, text: string) =>
  transcript.entries.some(
    (e) => e.content.type === 'assistant' && e.content.value.text.includes(text),
  );

describe('task call to transcript reference', () => {
  it('an Agent call that reported its agentId names the subagent transcript', () => {
    const transcript = mainTranscript('Agent', '{"status":"completed","agentId":"abc123"}');
    expect(subagentTool(transcript)?.subagentAgentID).toBe('abc123');
  });

  it('the older Task name and a background launch carry it too', () => {
    const task = mainTranscript('Task', '{"status":"completed","agentId":"abc123"}');
    expect(subagentTool(task)?.subagentAgentID).toBe('abc123');
    const background = mainTranscript(
      'Agent',
      '{"status":"async_launched","agentId":"abc123","isAsync":true}',
    );
    expect(subagentTool(background)?.subagentAgentID).toBe('abc123');
  });

  it('a call with no result, a teammate or an unsafe id has no transcript to open', () => {
    expect(subagentTool(mainTranscript('Agent', null))?.subagentAgentID).toBeNull();
    const teammate = mainTranscript(
      'Agent',
      '{"status":"teammate_spawned","agentId":"abc123","name":"qa"}',
    );
    expect(subagentTool(teammate)?.subagentAgentID).toBeNull();
    const traversal = mainTranscript(
      'Agent',
      '{"status":"completed","agentId":"../../etc/passwd"}',
    );
    expect(subagentTool(traversal)?.subagentAgentID).toBeNull();
    const other = mainTranscript('Bash', '{"agentId":"abc123"}');
    expect(subagentTool(other)?.subagentAgentID).toBeNull();
  });
});

describe('subagent route', () => {
  const entries = mainTranscript('Agent', '{"status":"completed","agentId":"abc123"}').entries;

  it('builds the path beside the session file and names the call', () => {
    const route = subagentRoute('abc123', SESSION_PATH, entries);
    expect(route).toEqual({
      agentID: 'abc123',
      path: `/Users/developer/.claude/projects/-workspace/${SESSION}/subagents/agent-abc123.jsonl`,
      title: 'Find callers',
      subtitle: 'Explore',
    });
  });

  it('refuses without a session path, a safe id, the call itself or a .jsonl session', () => {
    expect(subagentRoute('abc123', null, entries)).toBeNull();
    expect(subagentRoute('../x', SESSION_PATH, entries)).toBeNull();
    expect(subagentRoute('other', SESSION_PATH, entries)).toBeNull();
    expect(subagentRoute('abc123', '/x/session.txt', entries)).toBeNull();
  });
});

describe('subagent reader', () => {
  const PATH = '/x/agent-a.jsonl';

  it('a subagent file projects to its own conversation', () => {
    const transcript = subagentTranscriptFrom(SUBAGENT_DATA);
    expect(hasTool(transcript, 'Grep')).toBe(true);
    expect(hasText(transcript, 'One caller.')).toBe(true);
  });

  it('a file that is not there reads as missing', async () => {
    expect(await readSubagentTranscript(new FakeHostFiles(), PATH)).toEqual({ type: 'missing' });
  });

  it('a directory reads as missing', async () => {
    const files = new FakeHostFiles();
    files.mkdir(PATH);
    expect(await readSubagentTranscript(files, PATH)).toEqual({ type: 'missing' });
  });

  it('an empty file, or one with no conversation, reads as empty', async () => {
    const files = new FakeHostFiles();
    files.write(PATH, '');
    expect(await readSubagentTranscript(files, PATH)).toEqual({ type: 'empty' });
    files.write(PATH, 'not json\n');
    expect(await readSubagentTranscript(files, PATH)).toEqual({ type: 'empty' });
  });

  it('a line still being written is left out until it is whole', () => {
    const transcript = subagentTranscriptFrom(SUBAGENT_DATA.subarray(0, SUBAGENT_DATA.length - 20));
    expect(hasTool(transcript, 'Grep')).toBe(true);
    expect(hasText(transcript, 'One caller.')).toBe(false);
  });

  it('a whole file loads in full', async () => {
    const files = new FakeHostFiles();
    files.write(PATH, SUBAGENT_DATA);
    const outcome = await readSubagentTranscript(files, PATH);
    expect(outcome.type === 'loaded' && outcome.isPartial).toBe(false);
  });

  it('a file longer than the tail window shows its end and says so', async () => {
    const files = new FakeHostFiles();
    files.write(PATH, SUBAGENT_DATA);
    expect(SUBAGENT_DATA.length).toBeGreaterThan(700);
    const outcome = await readSubagentTranscript(files, PATH, { tailWindow: 700, readChunk: 256 });
    if (outcome.type !== 'loaded') throw new Error(`expected loaded, got ${outcome.type}`);
    expect(outcome.isPartial).toBe(true);
    expect(hasText(outcome.transcript, 'One caller.')).toBe(true);
  });

  it('a Host that cannot be read is reported with its reason', async () => {
    const files = new FakeHostFiles();
    files.write(PATH, SUBAGENT_DATA);
    files.failing.add(PATH);
    const outcome = await readSubagentTranscript(files, PATH);
    if (outcome.type !== 'unreadable') throw new Error(`expected unreadable, got ${outcome.type}`);
    expect(outcome.reason).not.toBe('');
  });
});
