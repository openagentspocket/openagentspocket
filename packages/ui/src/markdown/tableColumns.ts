// Column widths for a Markdown table. Text cannot be measured before it renders, so widths come
// from the character count at a generous width per character: a column is never narrower than its
// longest word (a cell wraps between words, never inside one), and never wider than its longest
// cell needs. When the table is narrower than the space it has, the column with the most text takes
// the rest; when it is wider, the columns with long text give way down to their longest word, and
// past that the table scrolls sideways in its own frame.

/** A width per character, as a share of the font size: above a proportional font's average, so a word fits. */
const CHARACTER_EM = 0.62;
/** Longer cells wrap, so a table stays a few columns wide instead of one endless line. */
const MAX_COLUMN_EM = 16;

export interface TableMetrics {
  /** The cells' font size. */
  readonly fontSize: number;
  /** A cell's horizontal padding and border, both sides together. */
  readonly cellInset: number;
  /** The width the table has before it must scroll; absent until it is known. */
  readonly available?: number;
}

const longestWord = (text: string): number =>
  Math.max(0, ...text.split(/\s+/u).map((word) => Array.from(word).length));

/** One width per column, shared by every row so the columns line up. */
export function tableColumnWidths(
  rows: readonly (readonly { text: string }[])[],
  metrics: TableMetrics,
): number[] {
  const { fontSize, cellInset, available } = metrics;
  const character = fontSize * CHARACTER_EM;
  const columns = Math.max(0, ...rows.map((row) => row.length));
  const texts = (column: number) => rows.map((row) => row[column]?.text ?? '');
  const floors = Array.from({ length: columns }, (_, column) =>
    Math.ceil(Math.max(1, ...texts(column).map(longestWord)) * character + cellInset),
  );
  const widths = floors.map((floor, column) => {
    const longest = Math.max(0, ...texts(column).map((text) => Array.from(text).length));
    const wanted = Math.min(longest * character, MAX_COLUMN_EM * fontSize) + cellInset;
    return Math.max(floor, Math.ceil(wanted));
  });
  if (available === undefined || columns === 0) return widths;
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (total < available) {
    // The column with the most text takes the rest.
    const widest = widths.indexOf(Math.max(...widths));
    widths[widest] = (widths[widest] as number) + (available - total);
    return widths;
  }
  // Too wide: columns with room above their longest word give way, in proportion to that room.
  const slack = widths.map((width, column) => width - (floors[column] as number));
  const room = slack.reduce((sum, value) => sum + value, 0);
  const cut = Math.min(room, total - available);
  if (room === 0) return widths;
  return widths.map((width, column) =>
    Math.floor(width - (cut * (slack[column] as number)) / room),
  );
}
