import { describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../hosts/cancellation';
import { utf8Decode, utf8Encode } from '../pairing/bytes';
import { TerminalMouseModes } from './mouse-modes';
import {
  pointsPerRow,
  TerminalTouchScroll,
  type TerminalTouchScrollDeps,
  TouchScrollAccumulator,
} from './touch-scroll';

const ROW = 16;
const OLDER = '\u001b[<64;40;12M';
const NEWER = '\u001b[<65;40;12M';

function setup(overrides: Partial<TerminalTouchScrollDeps> = {}, output = '\u001b[?1000;1006h') {
  const clock = new FakeClock();
  const modes = new TerminalMouseModes();
  modes.receive(utf8Encode(output));
  const sent: Array<{ report: string; rows: number }> = [];
  const didScroll = vi.fn();
  const touch = new TerminalTouchScroll({
    clock,
    modes,
    paneId: 'pane-1',
    grid: () => ({ cols: 80, rows: 24 }),
    scroll: (sequence, rows) => sent.push({ report: utf8Decode(sequence, true) ?? '', rows }),
    didScroll,
    ...overrides,
  });
  const rows = () => sent.reduce((total, { rows: count }) => total + count, 0);
  return { clock, modes, sent, rows, touch, didScroll };
}

describe('TouchScrollAccumulator', () => {
  it('turns distance into whole rows and carries the rest', () => {
    const rows = new TouchScrollAccumulator();
    expect(rows.rows(10, ROW)).toBe(0);
    expect(rows.rows(10, ROW)).toBe(1);
    expect(rows.rows(44, ROW)).toBe(3);
  });

  it('keeps the sign of the drag', () => {
    expect(new TouchScrollAccumulator().rows(-40, ROW)).toBe(-2);
  });

  it('drops the rest when the finger turns back', () => {
    const rows = new TouchScrollAccumulator();
    rows.rows(15, ROW);
    expect(rows.rows(-1, ROW)).toBe(0);
    expect(rows.rows(-15, ROW)).toBe(-1);
  });

  it('forgets the rest on reset', () => {
    const rows = new TouchScrollAccumulator();
    rows.rows(15, ROW);
    rows.reset();
    expect(rows.rows(1, ROW)).toBe(0);
  });

  it('answers nothing for a row with no height', () => {
    expect(new TouchScrollAccumulator().rows(100, 0)).toBe(0);
  });
});

describe('pointsPerRow', () => {
  it('follows the text size and never falls under the floor', () => {
    expect(pointsPerRow(20)).toBeGreaterThan(pointsPerRow(10));
    expect(pointsPerRow(1)).toBe(8);
  });
});

describe('TerminalTouchScroll', () => {
  it('sends a finger moving down as wheel-up rows, toward older content', () => {
    const { touch, sent, didScroll } = setup();
    touch.drag(40, ROW);
    expect(sent).toEqual([{ report: OLDER, rows: 2 }]);
    expect(didScroll).toHaveBeenCalledOnce();
  });

  it('sends a finger moving up as wheel-down rows, toward newer content', () => {
    const { touch, sent } = setup();
    touch.drag(-16, ROW);
    expect(sent).toEqual([{ report: NEWER, rows: 1 }]);
  });

  it('sends nothing until a whole row has passed', () => {
    const { touch, sent, didScroll } = setup();
    touch.drag(5, ROW);
    expect(sent).toEqual([]);
    expect(didScroll).not.toHaveBeenCalled();
  });

  it('stands aside while the remote takes no wheel, leaving the view its own scrollback', () => {
    const { touch, sent } = setup({}, 'plain shell');
    expect(touch.isActive()).toBe(false);
    touch.drag(40, ROW);
    expect(sent).toEqual([]);
  });

  it('never sends a tmux pane a wheel report: it would enter copy-mode', async () => {
    const { touch, sent, clock } = setup({ paneId: '%3' });
    expect(touch.isActive()).toBe(false);
    touch.drag(40, ROW);
    touch.release(2000, ROW);
    await clock.advance(500);
    expect(sent).toEqual([]);
  });

  it('sends nothing before the first layout', () => {
    const { touch, sent } = setup({ grid: () => null });
    touch.drag(40, ROW);
    expect(sent).toEqual([]);
  });

  it('tells its subscribers when the remote starts and stops taking the wheel', () => {
    const { touch, modes } = setup({}, '');
    const listener = vi.fn();
    touch.subscribe(listener);
    touch.modesDidChange();
    expect(listener).not.toHaveBeenCalled();
    modes.receive(utf8Encode('\u001b[?1002h'));
    touch.modesDidChange();
    expect(touch.isActive()).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
    modes.receive(utf8Encode('\u001b[?1002l'));
    touch.modesDidChange();
    expect(touch.isActive()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('carries a flick on after the finger lifts, slowing to a stop', async () => {
    const { touch, clock, rows, sent } = setup();
    touch.release(1600, ROW);
    await clock.advance(200);
    const early = rows();
    expect(early).toBeGreaterThan(0);
    await clock.advance(5000);
    const final = rows();
    expect(final).toBeGreaterThan(early);
    expect(sent.every(({ report }) => report === OLDER)).toBe(true);
    await clock.advance(5000);
    expect(rows()).toBe(final);
  });

  it('caps the speed of a flick', async () => {
    const fast = setup();
    const faster = setup();
    fast.touch.release(4000, ROW);
    faster.touch.release(90000, ROW);
    await fast.clock.advance(5000);
    await faster.clock.advance(5000);
    expect(faster.rows()).toBe(fast.rows());
  });

  it('lets a slow release stop where it is', async () => {
    const { touch, clock, sent } = setup();
    touch.release(60, ROW);
    await clock.advance(1000);
    expect(sent).toEqual([]);
  });

  it('halts a flick', async () => {
    const { touch, clock, rows } = setup();
    touch.release(1600, ROW);
    await clock.advance(100);
    const stopped = rows();
    touch.halt();
    await clock.advance(5000);
    expect(rows()).toBe(stopped);
  });

  it('forgets a part row on halt', () => {
    const { touch, sent } = setup();
    touch.drag(15, ROW);
    touch.halt();
    touch.drag(1, ROW);
    expect(sent).toEqual([]);
  });

  it('lets a new flick replace the one running', async () => {
    const { touch, clock, sent } = setup();
    touch.release(1600, ROW);
    touch.release(-1600, ROW);
    await clock.advance(5000);
    expect(sent.every(({ report }) => report === NEWER)).toBe(true);
  });

  it('ends a flick when the remote stops taking the wheel', async () => {
    const { touch, clock, modes, rows } = setup();
    touch.release(1600, ROW);
    await clock.advance(100);
    const stopped = rows();
    modes.receive(utf8Encode('\u001b[?1000l'));
    touch.modesDidChange();
    await clock.advance(5000);
    expect(rows()).toBe(stopped);
  });
});
