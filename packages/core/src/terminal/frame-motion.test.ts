import { describe, expect, it } from 'vitest';
import { loadScreen } from '../blocked/golden-fixtures.testkit';
import { screenText } from '../blocked/screen';
import { conversationMoved } from './frame-motion';

const CHROME = ['', '╭────────────╮', '│ >          │', '╰────────────╯', '  ? for shortcuts'];
const body = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => `  row ${from + i} of the reply, on the walk`);
const frame = (rows: string[], status = '✻ Thinking… (3s · ↑ 120 tokens · esc to interrupt)') =>
  [...rows, '', status, ...CHROME].join('\n');

describe('conversationMoved', () => {
  it('holds still on an identical frame', () => {
    expect(conversationMoved('a\nb', 'a\nb')).toBe(false);
  });

  it('ignores what a working Agent repaints in place', () => {
    const rows = body(0, 12);
    const still = frame(rows);
    expect(conversationMoved(still, frame(rows, '✶ Pondering… (4s · ↓ 180 tokens · esc'))).toBe(
      false,
    );
    expect(conversationMoved(still, frame(rows, '⠙ Working'))).toBe(false);
  });

  it('ignores several live rows at once, in a real capture', () => {
    const screen = screenText(loadScreen('codex-18-x7-phone-async-countdown'));
    const next = screen
      .replace(/Working \(\d+s/u, 'Working (13s')
      .replace(/questions · \d+s/u, 'questions · 19s');
    expect(next).not.toBe(screen);
    expect(conversationMoved(screen, next)).toBe(false);
  });

  it('ignores two timers a second apart that trade texts', () => {
    const lines = (a: number, b: number) =>
      frame([...body(0, 8), `  ⎿ Running… (${a}s)`, `  ⎿ Running… (${b}s)`]);
    expect(conversationMoved(lines(3, 4), lines(4, 5))).toBe(false);
  });

  it('sees a shift of one row, on a screen with few rows and a pinned box', () => {
    const screen = screenText(loadScreen('grok-03-working'));
    const rows = screen.split('\n');
    const shifted = [...rows.slice(0, 2), ...rows.slice(3, 10), '', ...rows.slice(10)].join('\n');
    expect(shifted).not.toBe(screen);
    expect(conversationMoved(screen, shifted)).toBe(true);
  });

  it('sees a shift while the status row animates', () => {
    expect(conversationMoved(frame(body(0, 12)), frame(body(8, 12), '✶ Pondering… (4s)'))).toBe(
      true,
    );
  });

  it('sees a page with no row in common', () => {
    expect(conversationMoved(frame(body(0, 12)), frame(body(100, 12)))).toBe(true);
  });

  it('sees a screen of numbers scroll', () => {
    const numbers = (from: number) =>
      Array.from({ length: 12 }, (_, i) => `${(from + i) * 7}  ${(from + i) * 13}`);
    expect(conversationMoved(frame(numbers(0)), frame(numbers(50)))).toBe(true);
  });

  it('counts a change on a screen with nothing else on it', () => {
    expect(conversationMoved('row 1', 'row 2')).toBe(true);
  });
});
