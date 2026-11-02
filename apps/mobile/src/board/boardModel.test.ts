import type { ConsoleRow } from '@openagentspocket/core';
import { buildBoard } from './boardModel';

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
