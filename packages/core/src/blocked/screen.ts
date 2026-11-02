import { textWidth } from './cell-width';

/** A color an SGR sequence set: one of the 256 indexed colors or a 24-bit value. */
export type ScreenColor =
  | { readonly kind: 'indexed'; readonly index: number }
  | { readonly kind: 'rgb'; readonly r: number; readonly g: number; readonly b: number };

/** The SGR attributes in effect for a cell; only the ones the Agents draw meaning with. */
export interface ScreenStyle {
  readonly foreground: ScreenColor | null;
  readonly background: ScreenColor | null;
  readonly isBold: boolean;
  readonly isDim: boolean;
  readonly isItalic: boolean;
  readonly isReverse: boolean;
}

export const PLAIN_STYLE: ScreenStyle = {
  foreground: null,
  background: null,
  isBold: false,
  isDim: false,
  isItalic: false,
  isReverse: false,
};

export function sameColor(a: ScreenColor | null, b: ScreenColor | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === 'indexed') return b.kind === 'indexed' && a.index === b.index;
  return b.kind === 'rgb' && a.r === b.r && a.g === b.g && a.b === b.b;
}

export function sameStyle(a: ScreenStyle, b: ScreenStyle): boolean {
  return (
    sameColor(a.foreground, b.foreground) &&
    sameColor(a.background, b.background) &&
    a.isBold === b.isBold &&
    a.isDim === b.isDim &&
    a.isItalic === b.isItalic &&
    a.isReverse === b.isReverse
  );
}

/** Consecutive cells of one row that share a style. */
export interface ScreenRun {
  readonly text: string;
  readonly style: ScreenStyle;
  /** The zero-based display column of the run's first cell. */
  readonly column: number;
  /** How many cells the run covers; a wide character counts two. */
  readonly width: number;
}

export const runEnd = (run: ScreenRun): number => run.column + run.width;

/** One row of the screen as styled runs. */
export interface ScreenRow {
  /** Zero-based. */
  readonly index: number;
  readonly runs: readonly ScreenRun[];
  /** The row's characters with styling removed, trailing spaces included. */
  readonly text: string;
  /** The row's width in cells, trailing spaces included. */
  readonly width: number;
}

export function makeRow(index: number, runs: readonly ScreenRun[]): ScreenRow {
  const last = runs[runs.length - 1];
  return {
    index,
    runs,
    text: runs.map((run) => run.text).join(''),
    width: last ? runEnd(last) : 0,
  };
}

/** A decoded `agent.read` of the visible screen. */
export interface AnsiScreen {
  readonly rows: readonly ScreenRow[];
  /** The pane's width as far as the screen shows it: the widest row. */
  readonly columns: number;
}

export function makeScreen(rows: readonly ScreenRow[]): AnsiScreen {
  return { rows, columns: rows.reduce((widest, row) => Math.max(widest, row.width), 0) };
}

/** A space or a no-break space: Claude draws its prompt with U+00A0 after the pointer. */
export const isBlankChar = (character: string): boolean => character === ' ' || character === ' ';

export const isBlankText = (text: string): boolean => [...text].every(isBlankChar);

export const normalizedSpaces = (text: string): string => text.replaceAll(' ', ' ');

const BLANKS = /^[\p{Zs}\t]+|[\p{Zs}\t]+$/gu;

/** Swift's `trimmingCharacters(in: .whitespaces)`: spaces and tabs, not line breaks. */
export const trimBlanks = (text: string): string => text.replace(BLANKS, '');

export const rowIsBlank = (row: ScreenRow): boolean => isBlankText(row.text);

/** The column of the first non-blank cell, or null for a blank row. */
export function rowIndent(row: ScreenRow): number | null {
  let column = 0;
  for (const character of row.text) {
    if (!isBlankChar(character)) return column;
    column += textWidth(character);
  }
  return null;
}

/** Where the visible text ends: the width without trailing blanks. */
export function contentWidth(row: ScreenRow): number {
  let trailing = 0;
  for (const character of [...row.text].reverse()) {
    if (!isBlankChar(character)) break;
    trailing += textWidth(character);
  }
  return row.width - trailing;
}

/** The text without leading and trailing blanks, a no-break space read as a space. */
export const trimmedText = (row: ScreenRow): string => trimBlanks(normalizedSpaces(row.text));

export const runAt = (row: ScreenRow, column: number): ScreenRun | undefined =>
  row.runs.find((run) => run.column <= column && column < runEnd(run));

export const isBlankRun = (run: ScreenRun): boolean => isBlankText(run.text);

/** The runs that are not only blanks. */
export const visibleRuns = (row: ScreenRow): ScreenRun[] =>
  row.runs.filter((run) => !isBlankRun(run));

/** The first character (code point) of a text, if any. */
export const firstChar = (text: string): string | undefined => {
  for (const character of text) return character;
  return undefined;
};

export const lastChar = (text: string): string | undefined => [...text].pop();

/** Characters of a text from the start, as a string (Swift's `prefix(n)`). */
export const prefixChars = (text: string, count: number): string =>
  [...text].slice(0, count).join('');
