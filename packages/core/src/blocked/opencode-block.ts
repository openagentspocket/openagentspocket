// The bar block that ends an OpenCode screen: a prompt, or the subagent panel, in place of the
// input box (Swift OpenCodeBlock).

import { textWidth } from './cell-width';
import { joinWrapped, wouldFitFirstWord } from './row-scanner';
import {
  type AnsiScreen,
  isBlankChar,
  normalizedSpaces,
  rowIsBlank,
  runAt,
  runEnd,
  type ScreenColor,
  type ScreenRow,
  type ScreenStyle,
  sameColor,
  sameStyle,
  trimBlanks,
} from './screen';

export interface OpenCodeBlockLine {
  /** The text right of the bar, trimmed. */
  readonly text: string;
  /** Blank cells between the bar and the text. */
  readonly indent: number;
  /** The column of the text's first cell. */
  readonly column: number;
  /** The fill just right of the bar. */
  readonly background: ScreenColor | null;
  readonly row: ScreenRow;
}

/** The text of the row from `column` on; a wide character straddling the column is dropped. */
export function textFromColumn(row: ScreenRow, column: number): string {
  let result = '';
  let position = 0;
  for (const character of row.text) {
    if (position >= column) result += character;
    position += textWidth(character);
  }
  return result;
}

/** The lines between blank rows, the padding rows dropped. */
export function sectionsOf(lines: readonly OpenCodeBlockLine[]): OpenCodeBlockLine[][] {
  const sections: OpenCodeBlockLine[][] = [];
  let current: OpenCodeBlockLine[] = [];
  for (const line of lines) {
    if (line.text === '') {
      if (current.length > 0) sections.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) sections.push(current);
  return sections;
}

interface Bar {
  readonly column: number;
  readonly style: ScreenStyle;
}

/** The bar a row starts with after blanks: its column and style. */
function barOf(row: ScreenRow): Bar | null {
  let column = 0;
  let found: number | null = null;
  for (const character of row.text) {
    if (!isBlankChar(character)) {
      found = character === '┃' ? column : null;
      break;
    }
    column += textWidth(character);
  }
  if (found === null) return null;
  const run = runAt(row, found);
  return run ? { column: found, style: run.style } : null;
}

const sameBar = (a: Bar, b: Bar) => a.column === b.column && sameStyle(a.style, b.style);

export class OpenCodeBlock {
  constructor(
    /** The zero-based screen rows from the top padding row through the bottom one, half open. */
    readonly rows: { lowerBound: number; upperBound: number },
    /** Every row inside the bar, top to bottom, blank ones included. */
    readonly lines: readonly OpenCodeBlockLine[],
    /** The column just past the last cell wrapped text may reach: the block's right edge less three. */
    readonly wrapColumn: number,
  ) {}

  get sections(): OpenCodeBlockLine[][] {
    return sectionsOf(this.lines);
  }

  /** `section` as the lines OpenCode drew: a row continues the one above when its first word would not have fit there. */
  paragraphs(section: readonly OpenCodeBlockLine[]): string[] {
    const paragraphs: OpenCodeBlockLine[][] = [];
    for (const line of section) {
      const last = paragraphs.at(-1);
      const previous = last?.at(-1);
      if (last && previous && !wouldFitFirstWord(line.text, previous.row, this.wrapColumn)) {
        last.push(line);
      } else {
        paragraphs.push([line]);
      }
    }
    return paragraphs.map((lines) => this.joined(lines));
  }

  /** The rows as one wrapped line. OpenCode breaks at blanks or after a hyphen, and cuts a word too long for its row at the edge. */
  joined(lines: readonly OpenCodeBlockLine[]): string {
    let text = '';
    let previous: OpenCodeBlockLine | null = null;
    for (const line of lines) {
      text = previous
        ? joinWrapped(text, line.text, 'codex', previous.row, this.wrapColumn, line.column)
        : line.text;
      previous = line;
    }
    return text;
  }

  /** The bar block whose last row is the screen's last non-blank one. */
  static bottom(screen: AnsiScreen): OpenCodeBlock | null {
    const rows = screen.rows;
    let last = rows.length - 1;
    while (last >= 0 && rowIsBlank(rows[last] as ScreenRow)) last -= 1;
    if (last < 0) return null;
    const bar = barOf(rows[last] as ScreenRow);
    if (!bar) return null;
    let top = last;
    while (top > 0) {
      const above = barOf(rows[top - 1] as ScreenRow);
      if (!above || !sameBar(above, bar)) break;
      top -= 1;
    }
    const lines = rows.slice(top, last + 1).map((row): OpenCodeBlockLine => {
      const rest = textFromColumn(row, bar.column + 1);
      let indent = 0;
      for (const character of rest) {
        if (!isBlankChar(character)) break;
        indent += textWidth(character);
      }
      return {
        text: trimBlanks(normalizedSpaces(rest)),
        indent,
        column: bar.column + 1 + indent,
        background: runAt(row, bar.column + 1)?.style.background ?? null,
        row,
      };
    });
    const panel = lines[0]?.background ?? null;
    const topRow = rows[top] as ScreenRow;
    const edgeRun = [...topRow.runs]
      .reverse()
      .find((run) => sameColor(run.style.background, panel));
    const edge = edgeRun ? runEnd(edgeRun) : screen.columns;
    return new OpenCodeBlock({ lowerBound: top, upperBound: last + 1 }, lines, edge - 3);
  }
}
