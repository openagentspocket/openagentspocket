import { textWidth } from './cell-width';
import {
  contentWidth,
  isBlankChar,
  PLAIN_STYLE,
  runAt,
  runEnd,
  type ScreenRow,
  type ScreenRun,
  type ScreenStyle,
  trimBlanks,
  trimmedText,
} from './screen';
import type { DialogOptionRole } from './types';

export const CLAUDE_POINTER = '❯';
export const CODEX_POINTER = '›';

/** A row that opens a numbered option: an optional pointer, the number, a period and a blank. */
export interface NumberedOptionRow {
  readonly rowIndex: number;
  readonly number: number;
  /** The pointer's column when the row has focus. */
  readonly pointerColumn: number | null;
  /** The column of the number's first digit. */
  readonly numberColumn: number;
  /** The column just past `N. `, where the label starts. */
  readonly labelColumn: number;
  /** The style of the number's first digit (Claude draws option numbers in its inactive color). */
  readonly numberStyle: ScreenStyle;
}

export const isPointed = (option: NumberedOptionRow): boolean => option.pointerColumn !== null;

/** How a program wraps long text, which decides whether two rows join with a space. */
export type TextWrapStyle = 'claude' | 'codex';

const isAsciiDigit = (character: string): boolean => character >= '0' && character <= '9';

/** Reads `[pointer] N. ` at the start of `row`. Numbers have at most two digits. */
export function numberedOption(row: ScreenRow, pointer: string): NumberedOptionRow | null {
  const characters = [...row.text];
  let index = 0;
  let column = 0;
  const advance = () => {
    column += textWidth(characters[index] ?? '');
    index += 1;
  };
  const isBlankAt = (at: number) => {
    const character = characters[at];
    return character !== undefined && isBlankChar(character);
  };
  const skipBlanks = () => {
    while (index < characters.length && isBlankAt(index)) advance();
  };

  skipBlanks();
  let pointerColumn: number | null = null;
  if (index < characters.length && characters[index] === pointer) {
    pointerColumn = column;
    advance();
    if (!isBlankAt(index)) return null;
    skipBlanks();
  }
  const numberColumn = column;
  let digits = '';
  while (index < characters.length && digits.length < 2 && isAsciiDigit(characters[index] ?? '')) {
    digits += characters[index];
    advance();
  }
  const number = digits === '' ? 0 : Number(digits);
  if (number <= 0 || index >= characters.length || characters[index] !== '.') return null;
  advance();
  if (!isBlankAt(index)) return null;
  advance();
  return {
    rowIndex: row.index,
    number,
    pointerColumn,
    numberColumn,
    labelColumn: column,
    numberStyle: runAt(row, numberColumn)?.style ?? PLAIN_STYLE,
  };
}

/** The text of `run` from `column` on; a wide character straddling the column is dropped. */
function textFrom(run: ScreenRun, column: number): string {
  let position = run.column;
  let text = '';
  for (const character of run.text) {
    if (position >= column) text += character;
    position += textWidth(character);
  }
  return text;
}

/**
 * The row's runs from `column` on. A run that starts earlier is cut at the column, so
 * `3. Type something.` drawn as one run still yields its label.
 */
export function runsFrom(row: ScreenRow, column: number): ScreenRun[] {
  const result: ScreenRun[] = [];
  for (const run of row.runs) {
    if (runEnd(run) <= column) continue;
    if (run.column >= column) {
      result.push(run);
      continue;
    }
    const text = textFrom(run, column);
    if (text === '') continue;
    const width = textWidth(text);
    result.push({ text, style: run.style, column: runEnd(run) - width, width });
  }
  return result;
}

/** Whether `text` is glyphs around an optional label padded with spaces. */
export function isLabeledRuleText(text: string, glyph: string): boolean {
  const characters = [...text];
  if (characters[0] !== glyph || characters[characters.length - 1] !== glyph) return false;
  let start = 0;
  while (characters[start] === glyph) start += 1;
  let end = characters.length;
  while (end > start && characters[end - 1] === glyph) end -= 1;
  const label = characters.slice(start, end);
  return label.length === 0 || (label[0] === ' ' && label[label.length - 1] === ' ');
}

/** A rule of `glyph` at least `minimumWidth` wide that may hold a padded label (`──── name ─`). */
export function isLabeledRule(row: ScreenRow, glyph: string, minimumWidth: number): boolean {
  const trimmed = trimmedText(row);
  return isLabeledRuleText(trimmed, glyph) && textWidth(trimmed) >= minimumWidth;
}

/** Whether `row` is a horizontal rule of `glyph` at least `minimumWidth` cells wide. */
export function isRule(row: ScreenRow, glyph: string, minimumWidth: number): boolean {
  const trimmed = trimmedText(row);
  if (trimmed === '' || ![...trimmed].every((character) => character === glyph)) return false;
  return textWidth(trimmed) >= minimumWidth;
}

/** Han, kana, CJK punctuation and fullwidth forms: scripts written without spaces. */
const UNSPACED_RANGES: readonly (readonly [number, number])[] = [
  [0x2e80, 0x2fdf],
  [0x3000, 0x30ff],
  [0x31f0, 0x31ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xf900, 0xfaff],
  [0xff00, 0xff60],
  [0xff61, 0xff9f],
  [0x20000, 0x3ffff],
];

const isUnspaced = (character: string): boolean => {
  const value = character.codePointAt(0) ?? 0;
  return UNSPACED_RANGES.some(([low, high]) => value >= low && value <= high);
};

const splitWords = (text: string): string[] => text.split(' ').filter((word) => word !== '');

/**
 * Appends the text of a wrapped row to the text it continues. Claude cuts a word longer than its
 * box at the box's edge, so two rows join without a space when the earlier one runs to the edge
 * without a trailing blank and the halves together would not have fit. Codex breaks after hyphens.
 */
export function joinWrapped(
  headText: string,
  tailText: string,
  wrap: TextWrapStyle,
  previousRow: ScreenRow,
  columns: number,
  boxColumn: number,
): string {
  const head = trimBlanks(headText);
  const tail = trimBlanks(tailText);
  if (head === '') return tail;
  if (tail === '') return head;
  if (wrap === 'codex' && head.endsWith('-')) return head + tail;
  const lastCharacter = [...previousRow.text].pop();
  const endsWithBlank = lastCharacter !== undefined && isBlankChar(lastCharacter);
  const reachesEdge = contentWidth(previousRow) >= columns - 1;
  if (wrap === 'claude' && endsWithBlank) return `${head} ${tail}`;
  const lastOfHead = [...head].pop();
  const firstOfTail = [...tail][0];
  if (
    lastOfHead !== undefined &&
    firstOfTail !== undefined &&
    isUnspaced(lastOfHead) &&
    isUnspaced(firstOfTail)
  ) {
    return head + tail;
  }
  if (reachesEdge) {
    const lastWord = splitWords(head).pop() ?? head;
    const firstWord = splitWords(tail)[0] ?? tail;
    if (textWidth(lastWord) + textWidth(firstWord) > columns - boxColumn) return head + tail;
  }
  return `${head} ${tail}`;
}

/** Whether the first word of `next` would have fit after `row`'s text. */
export function wouldFitFirstWord(next: string, row: ScreenRow, columns: number): boolean {
  const word = splitWords(trimBlanks(next))[0] ?? '';
  const lastCharacter = [...row.text].pop();
  const separator = lastCharacter !== undefined && isBlankChar(lastCharacter) ? 0 : 1;
  return contentWidth(row) + separator + textWidth(word) <= columns;
}

const MODIFIERS = ['shift', 'ctrl', 'alt', 'meta'];

function isShortcutKey(key: string): boolean {
  if (/^[a-z]$/.test(key)) return true;
  if (['esc', 'enter', 'tab', 'space'].includes(key)) return true;
  const parts = key.split('+').filter((part) => part !== '');
  const [modifier, name] = parts;
  if (parts.length !== 2 || modifier === undefined || name === undefined) return false;
  return MODIFIERS.includes(modifier) && /^[a-z0-9]+$/.test(name);
}

/**
 * Splits a trailing key hint such as ` (y)`, ` (esc)` or ` (shift+tab)` off a permission option's
 * label. Only single letters and key names count, so `Use defaults (recommended)` stays whole.
 */
export function splitShortcut(label: string): { label: string; shortcut: string | null } {
  const open = label.lastIndexOf('(');
  if (!label.endsWith(')') || open < 0) return { label, shortcut: null };
  const key = label.slice(open + 1, label.length - 1);
  const before = label.slice(0, open);
  if (!before.endsWith(' ') || !isShortcutKey(key)) return { label, shortcut: null };
  return { label: trimBlanks(before), shortcut: key };
}

const MODE_SWITCH_PHRASES = [
  'switch to auto mode',
  'switch to accept edits',
  'use auto mode',
  'auto-accept edits',
  'bypass',
];
const PERSISTENT_PHRASES = [
  "don't ask again",
  'always allow',
  'for this session',
  'from this project',
  'allow this host',
  'keep allowing',
  'in the future',
];

/** What a permission option does, from its label; null for a label outside the family. */
export function permissionRole(label: string, shortcut: string | null): DialogOptionRole | null {
  const folded = label.toLowerCase().replaceAll('’', "'");
  if (folded === 'no' || folded.startsWith('no,') || folded.startsWith('no ')) return 'decline';
  if (!(folded === 'yes' || folded.startsWith('yes,') || folded.startsWith('yes '))) return null;
  if (MODE_SWITCH_PHRASES.some((phrase) => folded.includes(phrase))) return 'approveModeSwitch';
  if (PERSISTENT_PHRASES.some((phrase) => folded.includes(phrase))) return 'approvePersistent';
  // Codex binds `a` and `p` only to options that store a rule.
  if (shortcut === 'a' || shortcut === 'p') return 'approvePersistent';
  return 'approve';
}
