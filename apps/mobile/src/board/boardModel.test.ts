import type { ConsoleRow } from '@openagentspocket/core';
import { buildBoard, dragTarget } from './boardModel';

const row = (pane: string): ConsoleRow =>
  ({ hostId: 'h', hostName: 'H', agent: { pane_id: pane } }) as unknown as ConsoleRow;

describe('buildBoard', () => {
  it('ranks pinned rows in order and flags the ends', () => {
    const board = buildBoard([row('a'), row('b'), row('c')], (_h, p) => p !== 'c');
    expect(board.pinned.map((e) => [e.rank, e.canMoveUp, e.canMoveDown])).toEqual([
      [1, false, true],
      [2, true, false],
    ]);
    expect(board.others.map((e) => e.row.agent.pane_id)).toEqual(['c']);
    expect(board.others[0]?.rank).toBeUndefined();
  });
});

describe('dragTarget', () => {
  it('moves by whole rows and rounds to the nearest', () => {
    expect(dragTarget(1, 100, 50, 5)).toBe(3);
    expect(dragTarget(3, -60, 50, 5)).toBe(2);
    expect(dragTarget(2, 20, 50, 5)).toBe(2);
  });

  it('clamps to the pinned list and ignores unmeasured rows', () => {
    expect(dragTarget(1, 900, 50, 3)).toBe(2);
    expect(dragTarget(1, -900, 50, 3)).toBe(0);
    expect(dragTarget(1, 100, 0, 3)).toBe(1);
  });
});
