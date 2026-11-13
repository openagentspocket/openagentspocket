import { describe, expect, it } from 'vitest';
import { renderText, type Text } from '../errors/text';
import { type CommentedLine, LINE_QUOTE_LIMIT, lineCommentText, quotedLine } from './line-comment';

const line = (over: Partial<CommentedLine> = {}): CommentedLine => ({
  path: 'src/cart/Cart.ts',
  number: 12,
  removed: false,
  text: '    return Math.round(gross);',
  ...over,
});

const keyOf = (text: Text | null) =>
  text && typeof text === 'object' && 'key' in text ? text.key : null;

describe('lineCommentText', () => {
  it('names the file, the line number, the quoted line and the comment', () => {
    const rendered = renderText(lineCommentText(line(), 'Round to cents') as Text);
    expect(rendered).toContain('src/cart/Cart.ts');
    expect(rendered).toContain('12');
    expect(rendered).toContain('return Math.round(gross);');
    expect(rendered).toContain('Round to cents');
  });

  it('a removed line is said as removed, with its own wording', () => {
    const removed = keyOf(lineCommentText(line({ removed: true }), 'Why?'));
    expect(removed).not.toBe(keyOf(lineCommentText(line(), 'Why?')));
    expect(removed).toContain('removed');
  });

  it('stays on one line whatever the comment or the line holds', () => {
    const rendered = renderText(
      lineCommentText(line({ text: 'a\tb\n' }), 'first\nsecond\r\n\nthird ') as Text,
    );
    expect(rendered).not.toMatch(/[\n\r]/);
    expect(rendered).toContain('first second third');
  });

  it('a blank line drops the quote; a blank comment is nothing to add', () => {
    expect(keyOf(lineCommentText(line({ text: '   ' }), 'Add a test'))).not.toBe(
      keyOf(lineCommentText(line(), 'Add a test')),
    );
    expect(lineCommentText(line(), ' \n ')).toBeNull();
  });

  it('is plain language: no slash command', () => {
    expect(renderText(lineCommentText(line(), '/compact') as Text).startsWith('/')).toBe(false);
  });
});

describe('quotedLine', () => {
  it('caps a very long line with an ellipsis', () => {
    const quoted = quotedLine('x'.repeat(500));
    expect(Array.from(quoted)).toHaveLength(LINE_QUOTE_LIMIT + 1);
    expect(quoted.endsWith('…')).toBe(true);
  });

  it('keeps a short line whole, trimmed', () => {
    expect(quotedLine('  const a = 1;  ')).toBe('const a = 1;');
  });

  it('never splits a character outside the basic plane', () => {
    const quoted = quotedLine('😀'.repeat(LINE_QUOTE_LIMIT + 5));
    expect(
      Array.from(quoted)
        .slice(0, -1)
        .every((char) => char === '😀'),
    ).toBe(true);
  });
});
