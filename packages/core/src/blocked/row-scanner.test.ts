import { describe, expect, it } from 'vitest';
import { decodeAnsiScreen } from './ansi-decoder';
import { textWidth } from './cell-width';
import { comparable } from './comparable';
import {
  CLAUDE_POINTER,
  CODEX_POINTER,
  isLabeledRuleText,
  isRule,
  joinWrapped,
  numberedOption,
  permissionRole,
  splitShortcut,
} from './row-scanner';
import { makeRow, PLAIN_STYLE, type ScreenRow } from './screen';

const plain = (text: string, index = 0): ScreenRow =>
  makeRow(
    index,
    text === '' ? [] : [{ text, column: 0, width: textWidth(text), style: PLAIN_STYLE }],
  );

describe('numberedOption', () => {
  it('reads an optional pointer, one or two digits, a period and a blank', () => {
    expect(numberedOption(plain('❯ 1. Yes'), CLAUDE_POINTER)).toMatchObject({
      number: 1,
      pointerColumn: 0,
      numberColumn: 2,
      labelColumn: 5,
    });
    expect(numberedOption(plain('  12. No'), CLAUDE_POINTER)).toMatchObject({
      number: 12,
      pointerColumn: null,
    });
    expect(numberedOption(plain('› 2. Green'), CODEX_POINTER)?.number).toBe(2);
  });

  it('refuses everything that is not an option row', () => {
    expect(numberedOption(plain('1.Yes'), CLAUDE_POINTER)).toBeNull();
    expect(numberedOption(plain('0. Zero'), CLAUDE_POINTER)).toBeNull();
    expect(numberedOption(plain('123. Three'), CLAUDE_POINTER)).toBeNull();
    expect(numberedOption(plain('❯1. Yes'), CLAUDE_POINTER)).toBeNull();
    expect(numberedOption(plain('› 1. Yes'), CLAUDE_POINTER)).toBeNull();
    expect(numberedOption(plain('Yes'), CLAUDE_POINTER)).toBeNull();
  });

  it('counts a no-break space after the pointer as a blank', () => {
    expect(numberedOption(plain('❯ 1. Yes'), CLAUDE_POINTER)?.number).toBe(1);
  });
});

describe('permissionRole', () => {
  it('sorts Claude and Codex labels', () => {
    expect(permissionRole('Yes', null)).toBe('approve');
    expect(permissionRole('No', null)).toBe('decline');
    expect(permissionRole('No, and tell Claude what to do differently', null)).toBe('decline');
    expect(permissionRole('Yes, and don’t ask again for this command', null)).toBe(
      'approvePersistent',
    );
    expect(permissionRole('Yes, and switch to auto mode', null)).toBe('approveModeSwitch');
    expect(permissionRole('Yes, proceed', 'a')).toBe('approvePersistent');
    expect(permissionRole('Yes, proceed', 'y')).toBe('approve');
    expect(permissionRole('Maybe', null)).toBeNull();
    expect(permissionRole('Nope', null)).toBeNull();
  });
});

describe('splitShortcut', () => {
  it('takes single letters and key names, not words', () => {
    expect(splitShortcut('Yes, proceed (y)')).toEqual({ label: 'Yes, proceed', shortcut: 'y' });
    expect(splitShortcut('No, and tell Codex what to do differently (esc)')).toEqual({
      label: 'No, and tell Codex what to do differently',
      shortcut: 'esc',
    });
    expect(splitShortcut('Go back (shift+tab)').shortcut).toBe('shift+tab');
    expect(splitShortcut('Use defaults (recommended)')).toEqual({
      label: 'Use defaults (recommended)',
      shortcut: null,
    });
    expect(splitShortcut('Yes(y)').shortcut).toBeNull();
  });
});

describe('rules', () => {
  it('recognises plain and labeled rules', () => {
    expect(isRule(plain('  ────────'), '─', 8)).toBe(true);
    expect(isRule(plain('────'), '─', 8)).toBe(false);
    expect(isLabeledRuleText('──── name ─', '─')).toBe(true);
    expect(isLabeledRuleText('──── name', '─')).toBe(false);
  });
});

describe('joinWrapped', () => {
  const row = (text: string) => plain(text);
  it('joins Claude rows with a space, or without when a long word was cut at the edge', () => {
    expect(joinWrapped('touch', 'a.txt', 'claude', row('touch '), 40, 2)).toBe('touch a.txt');
    const edge = 'x'.repeat(39);
    expect(joinWrapped(edge, 'tail', 'claude', row(edge), 40, 2)).toBe(`${edge}tail`);
  });

  it('keeps a Codex hyphen break unspaced', () => {
    expect(
      joinWrapped('touch x5-', 'narrow-probe-file.txt', 'codex', row('touch x5-'), 40, 2),
    ).toBe('touch x5-narrow-probe-file.txt');
  });

  it('runs Chinese and Japanese together', () => {
    expect(joinWrapped('你好', '世界', 'claude', row('你好'), 40, 2)).toBe('你好世界');
  });
});

describe('comparable', () => {
  it('drops all whitespace and reads a typographic apostrophe as a plain one', () => {
    expect(comparable('don\u2019 t\u00a0\n x')).toBe("don'tx");
  });
});

describe('the ANSI decoder', () => {
  it('carries style across rows and skips non-SGR sequences', () => {
    const screen = decodeAnsiScreen(
      '\u001b[1mhi\u001b[0m\r\n\u001b]0;title\u0007plain\u001b[2J\r\n',
    );
    expect(screen.rows.map((row) => row.text)).toEqual(['hi', 'plain']);
    expect(screen.rows[0]?.runs[0]?.style.isBold).toBe(true);
    expect(screen.rows[1]?.runs[0]?.style.isBold).toBe(false);
  });

  it('reads 256-color, truecolor and colon forms', () => {
    const screen = decodeAnsiScreen('\u001b[38;5;12ma\u001b[38;2;1;2;3mb\u001b[38:2::4:5:6mc');
    expect(screen.rows[0]?.runs.map((run) => run.style.foreground)).toEqual([
      { kind: 'indexed', index: 12 },
      { kind: 'rgb', r: 1, g: 2, b: 3 },
      { kind: 'rgb', r: 4, g: 5, b: 6 },
    ]);
  });

  it('counts wide characters as two cells and expands tabs', () => {
    const screen = decodeAnsiScreen('你a\tb');
    expect(screen.rows[0]?.runs.map((run) => run.column)).toEqual([0, 3]);
    expect(screen.rows[0]?.width).toBe(9);
  });
});
