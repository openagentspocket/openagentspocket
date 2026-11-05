// The Pi and Oh My Pi reducer's tree and tools, against the Swift PiChatTests the goldens do not cover.

import { describe, expect, it } from 'vitest';
import { encodeUtf8 } from '../../events/utf8';
import { type ChatLine, frameLines, lineEnd } from '../model/lines';
import type { ChatToolActivity } from '../model/types';
import { PiTranscriptReducer } from './reducer';
import { HEADER, lines, project, reduce, text, toolOf, user } from './reducer.testkit';

describe('tree', () => {
  it('follows the current branch through invisible entries', () => {
    const { transcript } = reduce([
      HEADER,
      user('u1', null, 'original'),
      '{"type":"message","id":"a1","parentId":"u1","message":{"role":"assistant","content":[{"type":"text","text":"abandoned answer"}],"stopReason":"stop"}}',
      '{"type":"custom","id":"branch","parentId":"u1","customType":"switch"}',
      '{"type":"message","id":"a2","parentId":"branch","message":{"role":"assistant","content":[{"type":"text","text":"current answer"}],"stopReason":"stop"}}',
    ]);
    expect(transcript.entries.map((entry) => entry.content)).toEqual([
      expect.objectContaining({ type: 'user' }),
      { type: 'assistant', value: { text: 'current answer' } },
    ]);
    expect(transcript.needsOlderHistory).toBe(false);
  });

  it('does not restore an abandoned branch from late usage', () => {
    const { transcript } = reduce([
      HEADER,
      user('a', null, 'old'),
      user('b', null, 'new'),
      '{"type":"model_usage","id":"usage","parentId":"a","activeLeafId":"b"}',
    ]);
    expect(transcript.entries.map((entry) => entry.id)).toEqual(['pi:b']);
  });

  it('converges after prepend and repeated reads', () => {
    const all = lines([
      HEADER,
      user('u', null, '你好'),
      '{"type":"message","id":"a","parentId":"u","message":{"role":"assistant","content":[{"type":"text","text":"回复"}],"stopReason":"stop"}}',
    ]);
    const whole = new PiTranscriptReducer();
    whole.append(all);
    const paged = new PiTranscriptReducer();
    paged.append(all.slice(2));
    expect(project(paged, 'unknown', (all[2] as ChatLine).offset).needsOlderHistory).toBe(true);
    paged.prepend(all.slice(0, 2));
    paged.append(all);
    expect(project(paged)).toEqual(project(whole));
  });

  it('counts malformed lines and notes unknown record types', () => {
    const { transcript } = reduce([
      HEADER,
      '{not json}',
      user('u', null, 'visible'),
      '{"type":"future_state","id":"f","parentId":"u"}',
    ]);
    expect(transcript.entries).toHaveLength(1);
    expect(transcript.diagnostics.invalidLines).toBe(1);
    expect([...transcript.diagnostics.unknownRecordTypes]).toEqual(['future_state']);
  });

  it('keeps branch ancestry for an oversized image record', () => {
    const [header] = lines([HEADER]) as [ChatLine];
    const prefix =
      '{"type":"message","id":"image","parentId":null,"message":{"role":"user","content":[{"type":"text","text":"look"},{"type":"image","data":"';
    const big: ChatLine = { offset: lineEnd(header), length: 2 << 20, data: encodeUtf8(prefix) };
    const answer = frameLines(
      encodeUtf8(
        '{"type":"message","id":"answer","parentId":"image","message":{"role":"assistant","content":[{"type":"text","text":"visible answer"}],"stopReason":"stop"}}\n',
      ),
      { startOffset: lineEnd(big) },
    );
    const reducer = new PiTranscriptReducer();
    reducer.append([header, big, ...answer]);
    const transcript = project(reducer);
    expect(transcript.entries).toHaveLength(2);
    expect(transcript.diagnostics.oversizedLines).toBe(1);
    expect(transcript.needsOlderHistory).toBe(false);
    expect(transcript.recordedPrompts).toEqual([]);
  });

  it('keeps a prior tail turn end from interrupting the current tool', () => {
    const { transcript } = reduce(
      [
        HEADER,
        '{"type":"message","id":"end","parentId":null,"message":{"role":"assistant","content":[],"stopReason":"stop"}}',
        user('u', 'end', 'next'),
        '{"type":"message","id":"a","parentId":"u","message":{"role":"assistant","content":[{"type":"toolCall","id":"c","name":"bash","arguments":{"command":"pwd"}}],"stopReason":"toolUse"}}',
      ],
      'pi',
      'working',
    );
    expect(toolOf(transcript)?.status).toBe('running');
  });
});

describe('tools', () => {
  it('reads a glob call as a search and ls as a listing', () => {
    const call = (name: string, args: string) => [
      HEADER,
      user('u', null, [text('go')]),
      `{"type":"message","id":"a","parentId":"u","message":{"role":"assistant","content":[{"type":"toolCall","id":"c","name":"${name}","arguments":${args}}],"stopReason":"toolUse"}}`,
      `{"type":"message","id":"r","parentId":"a","message":{"role":"toolResult","toolCallId":"c","toolName":"${name}","content":[{"type":"text","text":"x"}],"isError":false}}`,
    ];
    const glob = toolOf(
      reduce(call('glob', '{"i":"Finding","path":"**/*.txt"}'), 'omp', 'working').transcript,
    );
    expect([glob?.kind, glob?.title]).toEqual(['search', '**/*.txt']);
    const ls = toolOf(reduce(call('ls', '{"path":"src"}'), 'pi', 'working').transcript);
    expect([ls?.kind, ls?.title]).toEqual(['listing', 'src']);
  });

  it('pairs tools by id and reads the full output on demand', () => {
    const rows = [
      HEADER,
      user('u', null, [text('inspect'), { type: 'image', data: 'synthetic' }]),
      '{"type":"message","id":"a","parentId":"u","message":{"role":"assistant","content":[{"type":"thinking","thinking":"read first"},{"type":"toolCall","id":"c","name":"read","arguments":{"path":"file.swift"}}],"stopReason":"toolUse"}}',
      '{"type":"message","id":"r","parentId":"a","message":{"role":"toolResult","toolCallId":"c","toolName":"read","content":[{"type":"text","text":"file contents"}],"isError":true}}',
    ];
    const all = lines(rows);
    const reducer = new PiTranscriptReducer();
    reducer.append(all);
    const transcript = project(reducer, 'working');
    const tool = toolOf(transcript) as ChatToolActivity;
    expect([tool.status, tool.kind, tool.title, tool.preview?.text]).toEqual([
      'failed',
      'fileRead',
      'file.swift',
      'file contents',
    ]);
    expect(tool.output?.offset).toBe((all[3] as ChatLine).offset);
    expect(reducer.output(all[3] as ChatLine, tool)).toEqual({
      type: 'preview',
      preview: { text: 'file contents', isTruncated: false, imageCount: 0 },
      fileChanges: null,
    });
    const first = transcript.entries[0]?.content;
    expect(first).toMatchObject({ type: 'user', value: { text: 'inspect', imageCount: 1 } });
    expect(transcript.entries[1]?.content).toEqual({
      type: 'reasoning',
      value: { text: 'read first', durationMilliseconds: null },
    });
    expect(transcript.pendingRequests).toEqual([]);
  });

  it('subtitles a tool without a target by its intent', () => {
    const { transcript } = reduce(
      [
        HEADER,
        '{"type":"message","id":"a","parentId":null,"message":{"role":"assistant","content":[{"type":"toolCall","id":"c","name":"edit","arguments":{"input":"*** Begin Patch","i":"Fixing the typo"}}],"stopReason":"toolUse"}}',
      ],
      'pi',
      'working',
    );
    expect([toolOf(transcript)?.title, toolOf(transcript)?.subtitle]).toEqual([
      'edit',
      'Fixing the typo',
    ]);
  });

  it('reads a Pi tool interrupt as interrupted', () => {
    const { transcript } = reduce([
      HEADER,
      user('u', null, 'sleep'),
      '{"type":"message","id":"a","parentId":"u","message":{"role":"assistant","content":[{"type":"toolCall","id":"c","name":"bash","arguments":{"command":"sleep 60"}}],"stopReason":"toolUse"}}',
      '{"type":"message","id":"r","parentId":"a","message":{"role":"toolResult","toolCallId":"c","toolName":"bash","content":[{"type":"text","text":"Command aborted"}],"isError":true}}',
      '{"type":"message","id":"e","parentId":"r","message":{"role":"assistant","content":[],"stopReason":"error","errorMessage":"This operation was aborted"}}',
    ]);
    expect(toolOf(transcript)?.status).toBe('interrupted');
    expect(transcript.entries.at(-1)?.content).toMatchObject({
      type: 'notice',
      value: { kind: 'interrupted', title: 'Interrupted' },
    });
    expect(transcript.turns.at(-1)?.ending).toBe('interrupted');
  });
});
