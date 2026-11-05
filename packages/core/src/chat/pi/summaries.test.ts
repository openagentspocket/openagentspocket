// Summaries, minor roles and shell runs of Pi and Oh My Pi.

import { describe, expect, it } from 'vitest';
import { PiTranscriptReducer } from './reducer';
import { fixture, HEADER, lines, project, reduce, user } from './reducer.testkit';

describe('summaries and minor records', () => {
  it('previews summaries as plain lines and hides discarded branches', () => {
    const reducer = new PiTranscriptReducer();
    reducer.append(fixture('pi/transcripts/summaries.jsonl'));
    const transcript = project(reducer);
    const branch = transcript.entries.find(
      (entry) => entry.content.type === 'notice' && entry.content.value.title === 'Branch summary',
    )?.content;
    const compaction = transcript.entries.find(
      (entry) => entry.content.type === 'divider',
    )?.content;
    const details = [
      branch?.type === 'notice' ? branch.value.detail : null,
      compaction?.type === 'divider' ? compaction.value.detail : null,
    ];
    for (const detail of details) {
      expect(detail).not.toBeNull();
      expect(detail).not.toContain('#');
      expect(detail).not.toMatch(/\[[ x]\]/);
      expect(detail).not.toContain('read-files>');
    }
    expect(details[0]).toContain('• Assistant replied with “four”');
    expect(details[1]).toMatch(/^Goal\n• Simple reply tasks/);
    expect(branch?.type === 'notice' ? branch.value.rawDetail : '').toContain('## Goal\n');
    const { transcript: hidden } = reduce([
      HEADER,
      '{"type":"branch_summary","id":"empty","parentId":null,"fromId":"x","summary":""}',
      '{"type":"branch_summary","id":"kept","parentId":"empty","fromId":"x","summary":"Tried another fix"}',
    ]);
    expect(hidden.entries.map((entry) => entry.content)).toEqual([
      {
        type: 'notice',
        value: {
          kind: 'system',
          title: 'Branch summary',
          detail: 'Tried another fix',
          rawDetail: null,
          questions: [],
        },
      },
    ]);
  });

  it('keeps history and finished turns across a compaction', () => {
    const { transcript } = reduce([
      HEADER,
      user('u', null, 'hello', ',"timestamp":"2026-10-15T00:00:00.000Z"'),
      '{"type":"message","id":"a","parentId":"u","timestamp":"2026-10-15T00:00:03.000Z","message":{"role":"assistant","content":[{"type":"text","text":"done"}],"stopReason":"stop"}}',
      '{"type":"compaction","id":"c","parentId":"a","summary":"summary","firstKeptEntryId":"u"}',
    ]);
    expect(transcript.entries).toHaveLength(3);
    expect(transcript.entries.at(-1)?.content).toEqual({
      type: 'divider',
      value: { kind: 'compaction', detail: 'summary' },
    });
    const turn = transcript.turns[0];
    expect(turn?.ending).toBe('completed');
    expect(Date.parse(turn?.endedAt ?? '') - Date.parse(turn?.startedAt ?? '')).toBe(3000);
  });

  it('reads the minor roles and shell runs', () => {
    const { transcript } = reduce([
      HEADER,
      '{"type":"session_info","id":"n1","parentId":null,"name":"Named"}',
      '{"type":"message","id":"d","parentId":"n1","message":{"role":"developer","content":"continue"}}',
      '{"type":"message","id":"b","parentId":"d","message":{"role":"bashExecution","command":"ls","output":"a.txt"}}',
      '{"type":"message","id":"p","parentId":"b","message":{"role":"pythonExecution","code":"1+1","output":"2"}}',
    ]);
    expect(transcript.title).toBe('Named');
    expect(transcript.entries.map((entry) => entry.content)).toMatchObject([
      { type: 'notice', value: { kind: 'shellCommand', title: 'ls', detail: 'a.txt' } },
      { type: 'notice', value: { kind: 'pythonCommand', title: '1+1', detail: '2' } },
    ]);
  });

  it('refuses a session without a supported tree version', () => {
    const reducer = new PiTranscriptReducer();
    reducer.append(lines([HEADER.replace('"version":3', '"version":1')]));
    expect(reducer.unsupportedFormat).toBe('Pi session without a supported v2/v3 tree');
  });
});
