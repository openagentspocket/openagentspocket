import { describe, expect, it } from 'vitest';
import { makeRow, makeScreen, PLAIN_STYLE, screenText } from './screen';

const row = (index: number, text: string) =>
  makeRow(index, [{ text, style: PLAIN_STYLE, column: 0, width: text.length }]);

describe('screenText', () => {
  it('keeps the rows and drops what only pads them', () => {
    const screen = makeScreen([row(0, 'one   '), row(1, ''), row(2, 'two'), row(3, '    ')]);
    expect(screenText(screen)).toBe('one\n\ntwo');
  });
});
