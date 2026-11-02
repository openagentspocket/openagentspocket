import { describe, expect, it } from 'vitest';
import { utf8Encode } from '../pairing/bytes';
import {
  AttachUserMessageIndex,
  MATCH_PREFIX_CHARACTER_COUNT,
  MAXIMUM_ENTRY_COUNT,
  normalizeMessage,
  type OutgoingSource,
} from './user-message-index';

const CR = [0x0d];
const raw = (index: AttachUserMessageIndex) => index.entries.map((e) => e.rawText);

function feed(
  index: AttachUserMessageIndex,
  ...parts: Array<string | number[] | [number[], OutgoingSource]>
) {
  for (const part of parts) {
    if (typeof part === 'string') index.observeOutgoing(utf8Encode(part));
    else if (Array.isArray(part[0]))
      index.observeOutgoing(Uint8Array.from(part[0]), part[1] as OutgoingSource);
    else index.observeOutgoing(Uint8Array.from(part as number[]));
  }
}

describe('outgoing assembly', () => {
  it('assembles a line across chunks including a UTF-8 boundary split', () => {
    const index = new AttachUserMessageIndex();
    const text = '请实现这个解析器功能';
    const bytes = Array.from(utf8Encode(text));
    feed(index, bytes.slice(0, 1));
    expect(index.entries).toEqual([]);
    feed(index, bytes.slice(1, -2), bytes.slice(-2));
    expect(index.entries).toEqual([]);
    feed(index, CR);
    expect(raw(index)).toEqual([text]);
  });

  it.each([0x7f, 0x08])('backspace %i removes the last character before submit', (key) => {
    const index = new AttachUserMessageIndex();
    feed(index, 'please implement the parserx', [key], CR);
    expect(raw(index)).toEqual(['please implement the parser']);
  });

  it('backspace edits a Chinese character, not its bytes', () => {
    const index = new AttachUserMessageIndex();
    feed(index, '请实现这个解析器功错', [0x7f], '能', CR);
    expect(raw(index)).toEqual(['请实现这个解析器功能']);
  });

  it.each([
    [[0x1b, 0x5b, 0x44]],
    [[0x1b, 0x5b, 0x31, 0x3b, 0x32, 0x43]],
    [[0x1b, 0x4f, 0x41]],
    [[0x1b, 0x5b, 0x32, 0x20, 0x71]],
  ])('control sequence %j does not land in the text', (sequence) => {
    const index = new AttachUserMessageIndex();
    feed(index, 'please ', sequence as number[], 'implement the parser', CR);
    expect(raw(index)).toEqual(['please implement the parser']);
  });

  it('skips CSI and SS3 sequences split across chunks', () => {
    const csi = new AttachUserMessageIndex();
    feed(csi, 'please ', [0x1b], [0x5b, 0x44], 'implement the parser', CR);
    const ss3 = new AttachUserMessageIndex();
    feed(ss3, 'please ', [0x1b, 0x4f], [0x41], 'implement the parser', CR);
    expect(raw(csi)).toEqual(['please implement the parser']);
    expect(raw(ss3)).toEqual(['please implement the parser']);
  });

  it.each([[0x0d], [0x0a]])('terminator %i closes a line, and CRLF closes once', (key) => {
    const index = new AttachUserMessageIndex();
    feed(index, 'please implement the parser', [key]);
    expect(raw(index)).toEqual(['please implement the parser']);
    const crlf = new AttachUserMessageIndex();
    feed(crlf, 'please implement the parser\r\n');
    expect(raw(crlf)).toEqual(['please implement the parser']);
  });

  it('keeps a Composer-inserted multiline draft as one entry', () => {
    const index = new AttachUserMessageIndex();
    feed(index, [Array.from(utf8Encode('please approve\nthen continue')), 'composerInsert']);
    expect(index.entries).toEqual([]);
    feed(index, CR);
    expect(raw(index)).toEqual(['please approve\nthen continue']);
  });

  it.each(['', '   ', '\t\t', 'ok', 'y', '1234567'])('rejects the short line %j', (text) => {
    const index = new AttachUserMessageIndex();
    feed(index, text, CR);
    expect(index.entries).toEqual([]);
  });

  it('accepts a line at the minimum weight', () => {
    const index = new AttachUserMessageIndex();
    feed(index, '12345678', CR);
    expect(raw(index)).toEqual(['12345678']);
  });

  it('caps entries by dropping the oldest', () => {
    const index = new AttachUserMessageIndex();
    for (let i = 0; i <= MAXIMUM_ENTRY_COUNT; i += 1) {
      index.recordSubmitted(`message number ${String(i).padStart(3, '0')} is long enough`);
    }
    expect(index.entries).toHaveLength(MAXIMUM_ENTRY_COUNT);
    expect(index.entries[0]?.rawText).toBe('message number 001 is long enough');
    expect(index.entries.at(-1)?.rawText).toBe('message number 200 is long enough');
  });
});

describe('escape handling', () => {
  const approve: [number[], OutgoingSource] = [
    Array.from(utf8Encode('please approve')),
    'composerInsert',
  ];

  it('the Esc key cancels a Composer-inserted pending line', () => {
    const index = new AttachUserMessageIndex();
    feed(index, approve, [[0x1b], 'escapeKey'], CR);
    expect(index.entries).toEqual([]);
  });

  it.each([
    ['escape key', [[0x1b], 'escapeKey'] as [number[], OutgoingSource]],
    ['keystroke escape', [0x1b]],
  ])('%s then a bracketed request keeps none of the draft', (_name, escapeKey) => {
    const index = new AttachUserMessageIndex();
    feed(index, approve, escapeKey, '[review] do it', CR);
    expect(raw(index)).toEqual(['[review] do it']);
  });

  it('a keystroke escape preserves ordinary pending text', () => {
    const index = new AttachUserMessageIndex();
    feed(index, 'please implement ', [0x1b], 'the parser', CR);
    expect(raw(index)).toEqual(['please implement the parser']);
  });

  it('reset clears entries and pending bytes', () => {
    const index = new AttachUserMessageIndex();
    index.recordSubmitted('please implement the parser');
    feed(index, 'leftover pending');
    index.reset();
    expect(index.entries).toEqual([]);
    feed(index, 'please implement the parser', CR);
    expect(raw(index)).toEqual(['please implement the parser']);
  });
});

describe('normalizeMessage', () => {
  it.each(['❯ ', '› ', '> ', '▎ ', '  ', '│ ', '▎❯ '])('strips the leading %j', (lead) => {
    expect(normalizeMessage(`${lead}please implement the parser`)).toBe(
      'please implement the parser',
    );
  });

  it('joins a soft-wrapped box so it matches the typed line', () => {
    const typed = 'please implement the parser for user messages';
    const frame = '▎ please implement the\n▎ parser for user messages';
    expect(normalizeMessage(frame)).toBe(typed);
    const index = new AttachUserMessageIndex();
    index.recordSubmitted(typed);
    expect(index.frameContainsMessage(frame)).toBe(true);
  });
});

describe('visibleMessageKeys', () => {
  it('matches submitted text only when the frame carries it', () => {
    const index = new AttachUserMessageIndex();
    index.recordSubmitted('please implement the parser');
    expect(
      index.frameContainsMessage('the agent is thinking about a completely different topic'),
    ).toBe(false);
    expect(
      index.frameContainsMessage("The user asked: please implement the parser\nI'll start there."),
    ).toBe(true);
  });

  it('matches a bounded prefix of a long entry', () => {
    const index = new AttachUserMessageIndex();
    index.recordSubmitted('a'.repeat(120));
    expect(index.frameContainsMessage('a'.repeat(MATCH_PREFIX_CHARACTER_COUNT))).toBe(true);
    expect(index.frameContainsMessage('b'.repeat(64))).toBe(false);
  });

  it('survives a gutter timestamp on the message row', () => {
    const submitted = 'Test loop probe Charlie, reply with the word Charlie and change nothing';
    const frame =
      '❯ Test loop probe Charlie, reply with the        7:49 PM\n  word Charlie and change nothing';
    const index = new AttachUserMessageIndex();
    index.recordSubmitted(submitted);
    expect(normalizeMessage(frame).includes(submitted)).toBe(false);
    expect(index.frameContainsMessage(frame)).toBe(true);
  });

  it('treats prompt lines as targets without any submitted message', () => {
    const index = new AttachUserMessageIndex();
    const keys = index.visibleMessageKeys(
      [
        '❯ what does the transport do when preflight fails',
        '  and the host denies forwarding',
        'The answer is in ADR 0011.',
        '› a second question from another device',
      ].join('\n'),
    );
    expect(keys.size).toBe(2);
  });

  it('keeps a prompt line key stable as the message scrolls in', () => {
    const index = new AttachUserMessageIndex();
    const first = index.visibleMessageKeys(
      '❯ what does the transport do when preflight fails        7:49 PM',
    );
    const full = index.visibleMessageKeys(
      '❯ what does the transport do when preflight fails        7:52 PM\n  and the host denies forwarding',
    );
    expect(first.size).toBeGreaterThan(0);
    expect(full).toEqual(first);
  });

  it('yields only the user turns of a scrolled Claude frame', () => {
    const index = new AttachUserMessageIndex();
    const keys = index.visibleMessageKeys(
      [
        '❯ herdr 没办法动',
        '',
        '⏺ herdr 不动的话，iOS 这边只剩一条路径，先验证它有没有数据。',
        '',
        '⎿  $ herdr pane read w2:p3 --source recent --lines 400',
        '     > /tmp/out.txt',
        '',
        '❯ 从 ios 方面想办法',
        '',
        '────────────────────────────────────────────',
        '❯',
        '────────────────────────────────────────────',
      ].join('\n'),
    );
    expect([...keys].sort()).toEqual(['line:herdr 没办法动', 'line:从 ios 方面想办法'].sort());
  });

  it('counts ideographs double so a short Chinese message is a target, a two-character reply is not', () => {
    const index = new AttachUserMessageIndex();
    expect(index.visibleMessageKeys('❯ 安装到我手机上').size).toBeGreaterThan(0);
    index.recordSubmitted('安装到我手机上');
    expect(index.entries).toHaveLength(1);
    expect(index.visibleMessageKeys('❯ 继续').size).toBe(0);
    expect(index.visibleMessageKeys('> ok').size).toBe(0);
  });

  it('ignores an empty prompt, a glyph without a space and a deeply indented redirect', () => {
    const index = new AttachUserMessageIndex();
    expect(index.visibleMessageKeys('❯\n───────────').size).toBe(0);
    expect(index.visibleMessageKeys('>_ OpenAI Codex (v0.152.0)').size).toBe(0);
    expect(index.visibleMessageKeys('     > /tmp/out.txt and more words').size).toBe(0);
    expect(index.visibleMessageKeys('> a genuine question from the user').size).toBeGreaterThan(0);
  });
});
