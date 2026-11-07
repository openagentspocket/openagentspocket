import { textWidth } from './cell-width';
import { numberedOption } from './row-scanner';
import {
  type AnsiScreen,
  firstChar,
  isBlankChar,
  makeRow,
  PLAIN_STYLE,
  rowIndent,
  rowIsBlank,
  type ScreenRow,
  type ScreenRun,
} from './screen';

const BAR = '│';

/** The characters of `row` with the column each starts at. */
function* cells(row: ScreenRow): Generator<{ character: string; column: number }> {
  for (const run of row.runs) {
    let column = run.column;
    for (const character of run.text) {
      yield { character, column };
      column += textWidth(character);
    }
  }
}

const barColumns = (row: ScreenRow): number[] =>
  [...cells(row)].filter((cell) => cell.character === BAR).map((cell) => cell.column);

const hasBarAt = (row: ScreenRow | undefined, column: number): boolean =>
  row !== undefined && barColumns(row).includes(column);

function cutRun(run: ScreenRun, from: number, to: number): ScreenRun | null {
  let text = '';
  let start: number | null = null;
  let width = 0;
  let column = run.column;
  for (const character of run.text) {
    const cellWidth = textWidth(character);
    if (column >= from && column + cellWidth <= to) {
      start ??= column;
      text += character;
      width += cellWidth;
    }
    column += cellWidth;
  }
  return start === null ? null : { ...run, text, column: start, width };
}

/** `row` with only the cells in `[from, to)`; the cells before `from` read as blanks. */
export function cropRow(row: ScreenRow, from: number, to: number): ScreenRow {
  const kept = row.runs.flatMap((run) => cutRun(run, from, to) ?? []);
  if (from === 0) return makeRow(row.index, kept);
  const margin = { text: ' '.repeat(from), style: PLAIN_STYLE, column: 0, width: from };
  return makeRow(row.index, [margin, ...kept]);
}

/** The dialog's option rows: the last run on screen that counts up from `1.`. */
function optionRows(screen: AnsiScreen, pointer: string) {
  const { rows } = screen;
  for (let start = rows.length - 1; start >= 0; start -= 1) {
    const row = rows[start];
    if (!row || numberedOption(row, pointer)?.number !== 1) continue;
    const found = [{ row, labelColumn: numberedOption(row, pointer)?.labelColumn ?? 0 }];
    for (const next of rows.slice(start + 1)) {
      const option = numberedOption(next, pointer);
      if (option?.number === found.length + 1) {
        found.push({ row: next, labelColumn: option.labelColumn });
      }
    }
    return found;
  }
  return [];
}

/**
 * The screen without the panel a program draws beside its dialogs (Claude Code's context panel).
 * Its `│` runs down through every option row at one column, which an option's own text never does,
 * so everything from that column on goes, for as far as the bar runs: rows under the panel are
 * the screen's full width. Without such a column the screen comes back as it is.
 */
export function withoutSidePanel(screen: AnsiScreen, pointer: string): AnsiScreen {
  const options = optionRows(screen, pointer);
  const first = options[0];
  if (!first || options.length < 2) return screen;
  const column = barColumns(first.row).find(
    (candidate) =>
      candidate > first.labelColumn && options.every(({ row }) => hasBarAt(row, candidate)),
  );
  if (column === undefined) return screen;
  const { rows } = screen;
  let top = first.row.index;
  while (hasBarAt(rows[top - 1], column)) top -= 1;
  let bottom = first.row.index;
  while (hasBarAt(rows[bottom + 1], column)) bottom += 1;
  return {
    columns: column,
    rows: rows.map((row, at) => (at >= top && at <= bottom ? cropRow(row, 0, column) : row)),
  };
}

/** A row a frame opens: a bar, a corner or a rule where text would start. */
export function isFrameRow(row: ScreenRow): boolean {
  const character = firstChar(row.text.trimStart());
  return character !== undefined && '│┃├┤╭╮╰╯┌┐└┘─╌'.includes(character);
}

/** Rows that all carry a `│ ` gutter at one column, without it; any other rows as they are. */
export function withoutGutter(rows: readonly ScreenRow[]): readonly ScreenRow[] {
  const shown = rows.filter((row) => !rowIsBlank(row));
  const column = shown[0] ? rowIndent(shown[0]) : null;
  if (column === null || column === undefined) return rows;
  const opens = (row: ScreenRow): boolean => {
    const [bar, gap] = [...cells(row)].filter((cell) => cell.column >= column);
    return bar?.character === BAR && bar.column === column && isBlankChar(gap?.character ?? '');
  };
  if (!shown.every(opens)) return rows;
  return rows.map((row) => (rowIsBlank(row) ? row : cropRow(row, column + 2, row.width)));
}
