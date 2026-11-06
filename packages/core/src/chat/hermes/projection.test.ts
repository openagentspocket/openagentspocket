// What Hermes Agent's row lines read as in Chat, whatever the store said.

import { describe, expect, it } from 'vitest';
import { encodeUtf8 } from '../../events/utf8';
import type { ChatLine } from '../model/lines';
import { type ChatAgentActivity, projectionContext } from '../model/types';
import { HermesTranscriptReducer } from './reducer';

function line(offset: number, value: unknown): ChatLine {
  const data = encodeUtf8(JSON.stringify(value));
  return { offset, length: data.length, data };
}

const row = (seq: number, role: string, extra: object = {}) =>
  line(seq, { k: 'row', id: String(seq), seq, role, ts: 1_800_000_000 + seq, ...extra });

const call = { id: 'call_1', name: 'terminal', args: '{"command":"ls"}' };

function project(lines: ChatLine[], activity: ChatAgentActivity, windowStart = 0) {
  const reducer = new HermesTranscriptReducer();
  reducer.append(lines);
  return reducer.transcript(projectionContext({ activity, windowStart }));
}

const toolOf = (transcript: ReturnType<typeof project>) => {
  const content = transcript.entries.find((entry) => entry.content.type === 'tool')?.content;
  if (content?.type !== 'tool') throw new Error('no tool');
  return content.value;
};

describe('Hermes projection', () => {
  it('records a prompt so a sent message can match it', () => {
    const transcript = project([row(1, 'user', { c: '  hello  ', n: 9 })], 'idle');
    expect(transcript.recordedPrompts).toMatchObject([{ offset: 1, text: '  hello  ' }]);
    expect(transcript.latestPromptOffset).toBe(1);
    expect(transcript.turns).toHaveLength(1);
  });

  it('keeps a call running only while herdr reports the Agent working', () => {
    const lines = [row(1, 'user', { c: 'go' }), row(2, 'assistant', { tc: [call] })];
    expect(toolOf(project(lines, 'working')).status).toBe('running');
    const idle = project(lines, 'idle');
    expect(toolOf(idle).status).toBe('notCompleted');
    expect(idle.turns[0]?.ending).toBe('interrupted');
  });

  it('a turn with a final answer is over even while herdr still says working', () => {
    const lines = [row(1, 'user', { c: 'go' }), row(2, 'assistant', { c: 'done', fin: 'stop' })];
    expect(project(lines, 'working').turns[0]?.ending).toBe('completed');
  });

  it('a failed command reads as failed with its exit code', () => {
    const tool = toolOf(
      project(
        [
          row(1, 'assistant', { tc: [call] }),
          row(2, 'tool', { c: '{"output":"","exit_code":3}', tid: 'call_1', tool: 'terminal' }),
        ],
        'idle',
      ),
    );
    expect(tool.status).toBe('failed');
    expect(tool.exitCode).toBe(3);
  });

  it('a result whose call is above the window still shows, as its tool', () => {
    const transcript = project(
      [row(5, 'tool', { c: 'output', tid: 'call_0', tool: 'read_file' })],
      'idle',
      3,
    );
    expect(toolOf(transcript)).toMatchObject({ kind: 'fileRead', status: 'succeeded' });
    expect(transcript.needsOlderHistory).toBe(true);
  });

  it('cut arguments leave the tool its name', () => {
    const cut = { id: 'c', name: 'patch', args: '{"path":"/synthetic' };
    expect(toolOf(project([row(1, 'assistant', { tc: [cut] })], 'working')).title).toBe('patch');
  });

  it('text Hermes adds as a user message is a notice, not something the user said', () => {
    const transcript = project([row(1, 'user', { c: 'switched', kind: 'model_switch' })], 'idle');
    expect(transcript.entries.map((entry) => entry.content.type)).toEqual(['notice']);
    expect(transcript.recordedPrompts).toEqual([]);
  });

  it('says a cut message is cut', () => {
    const transcript = project([row(1, 'assistant', { c: 'abc', n: 9, fin: 'stop' })], 'idle');
    const content = transcript.entries[0]?.content;
    expect(content?.type === 'assistant' && content.value.text.length).toBeGreaterThan(3);
  });

  it('an older page never replaces a newer read, and bad lines are counted', () => {
    const reducer = new HermesTranscriptReducer();
    reducer.append([row(4, 'user', { c: 'newer' }), line(9, { k: 'nothing' })]);
    reducer.prepend([row(4, 'user', { c: 'older' })]);
    const transcript = reducer.transcript(projectionContext());
    expect(transcript.recordedPrompts.map((prompt) => prompt.text)).toEqual(['newer']);
    expect(transcript.diagnostics.invalidLines).toBe(1);
  });

  it('counts a role it does not know and shows the rest', () => {
    const transcript = project([row(1, 'system', { c: 'x' }), row(2, 'user', { c: 'hi' })], 'idle');
    expect(transcript.diagnostics.unknownRecordTypes.has('system')).toBe(true);
    expect(transcript.entries).toHaveLength(1);
  });
});
