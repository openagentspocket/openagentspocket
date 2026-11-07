/** Rough width of one character of the table's text; columns only need to be close. */
const CHARACTER = 8;
const PADDING = 20;
const MIN_COLUMN = 72;
/** Longer cells wrap, so a table stays a few columns wide instead of one endless line. */
const MAX_COLUMN = 260;

/** One width per column, shared by every row so the columns line up. */
export function tableColumnWidths(rows: readonly (readonly { text: string }[])[]): number[] {
  const columns = Math.max(0, ...rows.map((row) => row.length));
  return Array.from({ length: columns }, (_, column) => {
    const longest = Math.max(0, ...rows.map((row) => row[column]?.text.length ?? 0));
    return Math.min(MAX_COLUMN, Math.max(MIN_COLUMN, longest * CHARACTER + PADDING));
  });
}
