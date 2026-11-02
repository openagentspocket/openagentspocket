import { describe, expect, it } from 'vitest';
import { normalizeSmartPunctuation, parseArguments } from './arguments';

describe('parseArguments', () => {
  it('supports quotes, escapes and empty arguments', () => {
    expect(
      parseArguments(` --model "gpt 5" 'literal value' escaped\\ value "" prefix" suffix" `),
    ).toEqual({
      ok: true,
      arguments: ['--model', 'gpt 5', 'literal value', 'escaped value', '', 'prefix suffix'],
    });
    expect(parseArguments('   \n ')).toEqual({ ok: true, arguments: [] });
  });

  it('reports incomplete and unsafe input', () => {
    expect(parseArguments('"unfinished')).toEqual({ ok: false, error: 'unclosedDoubleQuote' });
    expect(parseArguments("'unfinished")).toEqual({ ok: false, error: 'unclosedSingleQuote' });
    expect(parseArguments('--flag\\')).toEqual({ ok: false, error: 'danglingEscape' });
    expect(parseArguments('"line\nbreak"')).toEqual({ ok: false, error: 'controlCharacter' });
  });
});

describe('normalizeSmartPunctuation', () => {
  it('turns smart punctuation back into ASCII and leaves ASCII alone', () => {
    expect(normalizeSmartPunctuation('—yolo')).toBe('--yolo');
    expect(normalizeSmartPunctuation('–v')).toBe('-v');
    expect(normalizeSmartPunctuation('--label “code review” ‘x’')).toBe(
      `--label "code review" 'x'`,
    );
    expect(normalizeSmartPunctuation("--plain 'ascii'")).toBe("--plain 'ascii'");
  });
});
