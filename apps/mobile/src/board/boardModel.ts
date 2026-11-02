import { type ConsoleRow, rowKey } from '@openagentspocket/core';

export interface BoardEntry {
  readonly row: ConsoleRow;
  readonly key: string;
  /** 1-based position among the pinned Agents; undefined when not pinned. */
  readonly rank: number | undefined;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
}

export interface Board {
  /** The user's priorities, in the order they set. */
  readonly pinned: readonly BoardEntry[];
  /** Every other Agent in Console order (Blocked first, then Working, Done, Idle). */
  readonly others: readonly BoardEntry[];
}

/**
 * Splits the Console rows into the user's ordered priorities and the rest. The rows arrive in
 * Console order, where pins already lead in pin order, so rank is the position among them.
 */
export function buildBoard(
  rows: readonly ConsoleRow[],
  isPinned: (hostId: string, paneId: string) => boolean,
): Board {
  const pinnedRows = rows.filter((row) => isPinned(row.hostId, row.agent.pane_id));
  const pinned = pinnedRows.map(
    (row, index): BoardEntry => ({
      row,
      key: rowKey(row),
      rank: index + 1,
      canMoveUp: index > 0,
      canMoveDown: index < pinnedRows.length - 1,
    }),
  );
  const others = rows
    .filter((row) => !isPinned(row.hostId, row.agent.pane_id))
    .map(
      (row): BoardEntry => ({
        row,
        key: rowKey(row),
        rank: undefined,
        canMoveUp: false,
        canMoveDown: false,
      }),
    );
  return { pinned, others };
}
