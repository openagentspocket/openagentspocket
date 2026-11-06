// Chat types into Hermes Agent only over a box it positively reads as idle and empty, and Stop's
// Ctrl+C never lands where it would clear a draft or quit.

import { describe, expect, it } from 'vitest';
import { type AnsiScreen, makeRow, makeScreen, PLAIN_STYLE } from '../../blocked/screen';
import { hermesID } from '../model/session-ids';
import { hermesSendPolicy, hermesStopGuard, readHermesInputBox } from './send-policy';

const ITALIC = { ...PLAIN_STYLE, isItalic: true };
const RULE = '─'.repeat(40);

type Run = readonly [text: string, italic?: boolean];

function screenOf(...rows: (string | readonly Run[])[]): AnsiScreen {
  return makeScreen(
    rows.map((row, index) => {
      const runs = typeof row === 'string' ? ([[row]] as const) : row;
      let column = 0;
      return makeRow(
        index,
        runs.map(([text, italic]) => {
          const width = [...text].length;
          const run = { text, style: italic ? ITALIC : PLAIN_STYLE, column, width };
          column += width;
          return run;
        }),
      );
    }),
  );
}

const boxed = (...prompt: readonly Run[]) => screenOf('output', RULE, prompt, RULE, 'status bar');

describe('Hermes input box', () => {
  it('reads an empty box, with or without its placeholder', () => {
    expect(readHermesInputBox(boxed(['❯ ']))).toMatchObject({ kind: 'empty', placeholder: null });
    expect(readHermesInputBox(boxed(['❯ '], ['Ask anything', true]))).toMatchObject({
      kind: 'empty',
      placeholder: 'Ask anything',
    });
  });

  it('reads a draft as text', () => {
    expect(readHermesInputBox(boxed(['❯ draft']))).toEqual({ kind: 'text', text: 'draft' });
  });

  it('holds while a turn runs, and over a draft typed meanwhile', () => {
    expect(readHermesInputBox(boxed(['☤ ', true], ['busy hint', true])).kind).toBe('noComposer');
    expect(readHermesInputBox(boxed(['☤ ', true], ['draft']))).toEqual({
      kind: 'text',
      text: 'draft',
    });
  });

  it('holds for what it does not recognize', () => {
    expect(readHermesInputBox(screenOf('plain output')).kind).toBe('unknown');
    expect(readHermesInputBox(boxed(['coder ❯ '])).kind).toBe('unknown');
    // An empty first line of a draft with more below it.
    expect(readHermesInputBox(screenOf(RULE, '❯ ', 'second line', RULE)).kind).toBe('unknown');
  });

  it('never reads an approval prompt over an old echo as sendable', () => {
    const screen = screenOf('❯ an earlier message', RULE, '⚠ ❯ ', RULE);
    expect(readHermesInputBox(screen).kind).not.toBe('empty');
  });
});

describe('Hermes Stop', () => {
  const working = boxed(['☤ ', true], ['busy hint', true]);

  it('presses Ctrl+C only on a running turn with an empty box', () => {
    expect(hermesStopGuard({ activity: 'working', screen: working })).toEqual({ kind: 'press' });
  });

  it('refuses where Ctrl+C would quit Hermes or clear a draft', () => {
    const idle = boxed(['❯ ']);
    const draft = boxed(['☤ ', true], ['draft']);
    expect(hermesStopGuard({ activity: 'idle', screen: working }).kind).toBe('refuse');
    expect(hermesStopGuard({ activity: 'working', screen: idle }).kind).toBe('refuse');
    expect(hermesStopGuard({ activity: 'working', screen: draft }).kind).toBe('refuse');
  });

  it('waits past the window in which a second Ctrl+C force-quits', () => {
    const { stop } = hermesSendPolicy();
    expect(stop.keys).toEqual(['ctrl+c']);
    expect(stop.wait.minimumGapMs).toBeGreaterThan(2000);
  });
});

describe('Hermes session ids', () => {
  it.each([
    'local-0a1b2c3d4e5f',
    '20261106_174500_a1b2c3',
    'cron_job-1_20261106_174500',
    'bg_174500_a1b2c3',
    'api-0123456789abcdef',
    '0a1b2c3d-1234-4abc-8def-0123456789ab',
  ])('accepts %s', (id) => {
    expect(hermesID(id)).toBe(id);
  });

  it.each(["x' OR 1=1", '/home/a/b', '', '.hidden', `${'a'.repeat(200)}`])('refuses %s', (id) => {
    expect(hermesID(id)).toBeNull();
  });
});
