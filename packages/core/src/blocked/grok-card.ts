// A Grok Build card as the dialog parser reads it (Swift GrokCard): rows behind a `┃` bar on a
// lighter background, each option a row `<key> (○) <label>` with any description two spaces or more
// after the label, and the card's own hints in the footer.

import { message } from '../errors/text';
import { textWidth } from './cell-width';
import { excerptFingerprint } from './fingerprint';
import { textFromColumn, withoutScrollbar } from './grok-screen';
import {
  type AnsiScreen,
  isBlankChar,
  normalizedSpaces,
  rowIndent,
  runAt,
  type ScreenRow,
  sameColor,
  trimBlanks,
} from './screen';
import {
  type DialogFocusState,
  type DialogOption,
  type GenericDialogExcerpt,
  makeFocus,
} from './types';

export interface GrokOption {
  key: string;
  /** `(●)`: the cursor on a permission or the subagent panel, a chosen answer on a question. */
  isMarked: boolean;
  label: string;
  /** The text two spaces or more after the label: an answer's description. */
  detail: string | null;
  /** The row reaches the card's edge, where Grok cuts what doesn't fit, a space before it included. */
  isCut: boolean;
}

/** `known` in full, or its start where the edge cut the label. */
export const optionNames = (option: GrokOption, known: string): boolean =>
  option.label === known ||
  (option.isCut && [...option.label].length >= 8 && known.startsWith(option.label));

export const optionBegins = (option: GrokOption, stem: string): boolean =>
  option.label.startsWith(stem) ||
  (option.isCut && [...option.label].length >= 8 && stem.startsWith(option.label));

/** `known` cut short with `…`. */
export function optionShortens(option: GrokOption, known: string): boolean {
  if (!option.label.endsWith('…')) return false;
  const shown = [...option.label].slice(0, -1).join('');
  return [...shown].length >= 8 && known.startsWith(shown);
}

export interface GrokLine {
  row: ScreenRow;
  /** The text after the bar, the scrollbar dropped, trimmed. */
  text: string;
  /** The column `text` starts at. */
  column: number;
  option: GrokOption | null;
  /** The cursor's band: where the text starts, the background differs from the card's, or reverse video is on. */
  hasBand: boolean;
  /** The label, or a row's text, is bold. */
  isBold: boolean;
}

const OPTION = /^([0-9a-z]+)\s+\(([●○])\)(?:\s+(.*))?$/du;

function readLine(row: ScreenRow, edge: number): GrokLine {
  const bar = rowIndent(row) ?? 0;
  const after = textFromColumn(row, bar + 1);
  let leading = '';
  for (const character of after) {
    if (!isBlankChar(character)) break;
    leading += character;
  }
  const column = bar + 1 + textWidth(leading);
  const text = withoutScrollbar(trimBlanks(normalizedSpaces(after)));
  let labelColumn = column;
  let option: GrokOption | null = null;
  const match = OPTION.exec(text);
  if (match) {
    const rest = match[3] ?? '';
    const gap = /\s{2,}/u.exec(rest);
    const label = gap ? rest.slice(0, gap.index) : rest;
    const detail = gap ? trimBlanks(rest.slice(gap.index + gap[0].length)) : null;
    const end = column + textWidth(text);
    option = {
      key: match[1] as string,
      isMarked: match[2] === '●',
      label,
      detail: detail === null || detail === '' ? null : detail,
      isCut: end >= edge - 1,
    };
    const start = match.indices?.[3]?.[0];
    if (start !== undefined) labelColumn += textWidth(text.slice(0, start));
  }
  const base = runAt(row, bar + 1)?.style;
  const start = runAt(row, column)?.style;
  const hasBand =
    base !== undefined && start !== undefined && text !== ''
      ? !sameColor(start.background, base.background) || start.isReverse !== base.isReverse
      : false;
  return {
    row,
    text,
    column,
    option,
    hasBand,
    isBold: runAt(row, labelColumn)?.style.isBold === true,
  };
}

/** The hints Grok shows while a card has the keyboard: `1/5:select`, and Tab to the next row. */
const showsCardHints = (footer: string): boolean =>
  ['Tab:next option', 'Tab:next answer', 'Tab:next choice'].some((hint) => footer.includes(hint)) ||
  /(?:^|\s)1\/\d:select/u.test(footer);

/** A question's `↑/↓ navigate` row, with its counter for several questions, and a permission's scope hint. */
const isHint = (text: string): boolean =>
  text.startsWith('↑/↓') ||
  text.startsWith('[') ||
  text.startsWith('← →') ||
  text.startsWith('e edit pattern');

/** The banded option; where a hovered row is banded too, the one with a bold label; with no band, the `(●)` row. */
function cursorIn(lines: readonly GrokLine[]): number | null {
  const options = lines.flatMap((line, index) => (line.option === null ? [] : [index]));
  const banded = options.filter((index) => lines[index]?.hasBand);
  if (banded.length > 1) {
    const bold = banded.filter((index) => lines[index]?.isBold);
    return bold.length === 1 ? (bold[0] as number) : null;
  }
  const only = banded[0];
  if (only !== undefined) return only;
  const marked = options.filter((index) => lines[index]?.option?.isMarked === true);
  return marked.length === 1 ? (marked[0] as number) : null;
}

export class GrokCard {
  readonly lines: GrokLine[];
  /** The footer shows the card's hints, so the card has the keyboard. */
  readonly hasKeyboard: boolean;
  /** The line of the cursor's option, while the card has the keyboard. */
  readonly cursor: number | null;

  constructor(
    readonly rows: { lowerBound: number; upperBound: number },
    screen: AnsiScreen,
    footer: string | null,
  ) {
    const rowList = screen.rows.slice(rows.lowerBound, rows.upperBound);
    // The card ends two cells short of the screen's edge, and its rows two cells short of that.
    const edge = rowList.reduce((widest, row) => Math.max(widest, row.width), 0) - 4;
    this.lines = rowList.map((row) => readLine(row, edge));
    this.hasKeyboard = footer === null ? false : showsCardHints(footer);
    this.cursor = this.hasKeyboard ? cursorIn(this.lines) : null;
  }

  /** The focus of the card's `options`: the cursor's, which may lie on a row the card doesn't offer. */
  focus(options: readonly DialogOption[]): DialogFocusState {
    return makeFocus({
      focusedOrdinal: options.find((option) => option.isFocused)?.ordinal ?? null,
      keysMissOptions: !this.hasKeyboard,
    });
  }

  /**
   * The card's rows for the generic card: without the bar and the scrollbar, each indented as on
   * screen. The fingerprint leaves out the cursor's mark and the key hints, so moving the cursor
   * with the key pad keeps the card.
   */
  excerpt(reason: string): GenericDialogExcerpt {
    const columns = this.lines.filter((line) => line.text !== '').map((line) => line.column);
    const indent = columns.length === 0 ? 0 : Math.min(...columns);
    const display = this.lines.map((line) =>
      line.text === '' ? '' : ' '.repeat(Math.max(0, line.column - indent)) + line.text,
    );
    const content = this.lines
      .map((line) => line.text)
      .filter((text) => !isHint(text))
      .map((text) => text.replaceAll('(●)', '(○)'));
    return {
      rows: this.lines.map((line) => line.row),
      numbered: new Map(),
      reason: message(reason),
      fingerprint: excerptFingerprint('grok', content),
      displayLines: display,
    };
  }
}
