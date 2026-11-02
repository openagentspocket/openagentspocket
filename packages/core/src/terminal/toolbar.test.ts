import { describe, expect, it } from 'vitest';
import {
  commandKeys,
  leadingKeys,
  STANDARD_TOOLBAR,
  sentHistoryEntries,
  sentHistoryTitle,
  trailingKeys,
} from './toolbar';

describe('toolbar configuration', () => {
  it('lays the capsule out around the divider', () => {
    expect(leadingKeys(STANDARD_TOOLBAR)).toEqual(['control', 'escape', 'tab']);
    expect(trailingKeys(STANDARD_TOOLBAR)).toEqual(['dPad', 'keyboard', 'more']);
  });

  it('always keeps Ctrl, Keyboard and More', () => {
    const bare = { showsEscape: false, showsTab: false, showsDPad: false };
    expect(leadingKeys(bare)).toEqual(['control']);
    expect(trailingKeys(bare)).toEqual(['keyboard', 'more']);
  });

  it('moves hidden keys into Commands so they stay reachable', () => {
    expect(commandKeys(STANDARD_TOOLBAR)).toEqual(['shiftTab', 'backspace', 'shiftEnter']);
    expect(commandKeys({ ...STANDARD_TOOLBAR, showsEscape: false })).toContain('escape');
    const keys = commandKeys({ ...STANDARD_TOOLBAR, showsDPad: false });
    expect(keys).toEqual(expect.arrayContaining(['up', 'down', 'left', 'right', 'enter']));
  });
});

describe('sent history', () => {
  it('lists newest first, each text once, blanks dropped, bounded', () => {
    expect(sentHistoryEntries(['a', 'b', '  ', 'a', 'c'])).toEqual(['c', 'a', 'b']);
    const many = Array.from({ length: 30 }, (_, i) => `m${i}`);
    expect(sentHistoryEntries(many)).toHaveLength(10);
    expect(sentHistoryEntries(many)[0]).toBe('m29');
  });

  it('titles with the first line, cut with an ellipsis', () => {
    expect(sentHistoryTitle('fix it')).toBe('fix it');
    expect(sentHistoryTitle('first\nsecond')).toBe('first…');
    expect(sentHistoryTitle('x'.repeat(60))).toBe(`${'x'.repeat(48)}…`);
    expect(sentHistoryTitle('\n  hi')).toBe('hi');
  });
});
