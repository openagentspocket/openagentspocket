import type { Text } from '../errors/text';
import { excerptFingerprint } from './fingerprint';
import {
  CLAUDE_POINTER,
  isLabeledRuleText,
  type NumberedOptionRow,
  numberedOption,
} from './row-scanner';
import {
  type AnsiScreen,
  contentWidth,
  isBlankChar,
  isBlankRun,
  isBlankText,
  normalizedSpaces,
  rowIndent,
  rowIsBlank,
  runAt,
  type ScreenColor,
  type ScreenRow,
  type ScreenRun,
  sameColor,
  trimBlanks,
  trimmedText,
} from './screen';
import type { GenericDialogExcerpt, InputRowState } from './types';

/** A full-width `─` rule from column 0; the top rule may carry the session's name. */
export function isBoxRule(row: ScreenRow, minimumWidth: number): boolean {
  return (
    rowIndent(row) === 0 &&
    contentWidth(row) >= minimumWidth &&
    isLabeledRuleText(trimmedText(row), '─')
  );
}

function promptGlyph(row: ScreenRow): string | null {
  const [first, second] = [...row.text];
  if (first === undefined || second === undefined) return null;
  if (!(first === CLAUDE_POINTER || first === '!') || !isBlankChar(second)) return null;
  if (row.runs[0]?.style.background != null) return null;
  return numberedOption(row, CLAUDE_POINTER) === null ? first : null;
}

/**
 * Claude's prompt: one or more input rows between two full-width rules, the first starting with
 * `❯` (or `!` in shell mode) and a blank at column 0, on no background. Whether one is on screen
 * means no dialog is.
 */
export function hasClaudeInputBox(screen: AnsiScreen): boolean {
  const rows = screen.rows;
  const minimumWidth = Math.max(8, screen.columns - 4);
  const isRule = (at: number) => {
    const row = rows[at];
    return row !== undefined && isBoxRule(row, minimumWidth);
  };
  for (let bottom = rows.length - 1; bottom >= 0; bottom -= 1) {
    if (!isRule(bottom)) continue;
    let row = bottom - 1;
    while (row > 0 && bottom - row <= 30) {
      if (isRule(row)) break;
      const current = rows[row];
      if (current && promptGlyph(current) !== null && isRule(row - 1)) return true;
      row -= 1;
    }
  }
  return false;
}

/**
 * The numbered options nearest the bottom of the screen: rows 1…N whose numbers share one color,
 * with no blank row between them. Numbers in a plan or a reply carry no color.
 */
export interface ClaudeOptionBlock {
  readonly rows: readonly NumberedOptionRow[];
  /** The color of option numbers, descriptions and hints. */
  readonly inactive: ScreenColor;
  /** The color of the pointer and the focused label. */
  readonly accent: ScreenColor | null;
}

export function locateOptionBlock(screen: AnsiScreen): ClaudeOptionBlock | null {
  const numbered: NumberedOptionRow[] = [];
  for (const row of screen.rows) {
    const option = numberedOption(row, CLAUDE_POINTER);
    if (option && option.numberStyle.foreground !== null) numbered.push(option);
  }
  const last = numbered[numbered.length - 1];
  const color = last?.numberStyle.foreground;
  if (!last || !color) return null;
  const block = [last];
  for (let at = numbered.length - 2; at >= 0; at -= 1) {
    const candidate = numbered[at];
    const first = block[0];
    if (!candidate || !first || first.number <= 1 || candidate.number !== first.number - 1) break;
    if (!sameColor(candidate.numberStyle.foreground, color)) break;
    const between = screen.rows.slice(candidate.rowIndex + 1, first.rowIndex);
    if (between.some(rowIsBlank)) break;
    block.unshift(candidate);
  }
  let accent: ScreenColor | null = null;
  for (const option of block) {
    if (option.pointerColumn === null) continue;
    const row = screen.rows[option.rowIndex];
    const foreground = row ? (runAt(row, option.pointerColumn)?.style.foreground ?? null) : null;
    if (foreground) {
      accent = foreground;
      break;
    }
  }
  return { rows: block, inactive: color, accent };
}

/** The content of a text field as drawn. */
export type FieldText =
  | { readonly kind: 'placeholder'; readonly text: string }
  | { readonly kind: 'typed'; readonly text: string };

export const fieldInputState = (field: FieldText): InputRowState =>
  field.kind === 'placeholder'
    ? { kind: 'placeholder', text: field.text }
    : { kind: 'text', text: field.text };

const placeholder = (text: string): FieldText => ({ kind: 'placeholder', text });
const typed = (text: string): FieldText => ({ kind: 'typed', text });

const joinText = (runs: readonly ScreenRun[]): string => runs.map((run) => run.text).join('');

/**
 * Reads a field whose runs include the reverse-video cursor cell. An empty field shows its
 * placeholder as the cursor cell followed by dim text; typed text sits around the cursor, which
 * follows it as a blank cell when it is at the end.
 */
export function readFieldText(runs: readonly ScreenRun[]): FieldText {
  const cursor = runs.findIndex((run) => run.style.isReverse);
  if (cursor < 0) {
    const text = trimBlanks(normalizedSpaces(joinText(runs)));
    const visible = runs.filter((run) => !isBlankRun(run));
    if (visible.length > 0 && visible.every((run) => run.style.isDim)) return placeholder(text);
    return typed(text);
  }
  const before = joinText(runs.slice(0, cursor));
  const after = runs.slice(cursor + 1);
  const afterVisible = after.filter((run) => !isBlankRun(run));
  const cursorText = runs[cursor]?.text ?? '';
  if (trimBlanks(before) === '') {
    if (afterVisible.length === 0 && isBlankText(cursorText)) return placeholder('');
    if (afterVisible.length > 0 && afterVisible.every((run) => run.style.isDim)) {
      return placeholder(trimBlanks(normalizedSpaces(cursorText + joinText(after))));
    }
  }
  return typed(trimBlanks(normalizedSpaces(before + cursorText + joinText(after))));
}

/** What a row's runs say once split into the parts an option row has. */
export interface OptionRowReading {
  label: string;
  /** The label is drawn in the inactive color: an empty text field's placeholder. */
  labelIsInactive: boolean;
  detail: string | null;
  /** A text field with the cursor in it. */
  field: FieldText | null;
  /** `No` in `No, and tell Claude…`: the row Tab turned into a note field. */
  feedbackLabel: string | null;
  droppedResidue: boolean;
  /** The label ended in ` ✔`: the answer chosen earlier. */
  isMarkedChosen: boolean;
}

export const emptyReading = (): OptionRowReading => ({
  label: '',
  labelIsInactive: false,
  detail: null,
  field: null,
  feedbackLabel: null,
  droppedResidue: false,
  isMarkedChosen: false,
});

/** An option while its rows are being read. */
export interface OptionDraft {
  number: number | null;
  rowIndex: number;
  labelColumn: number;
  isFocused: boolean;
  isChecked: boolean | null;
  label: string;
  labelIsInactive: boolean;
  detail: string | null;
  field: FieldText | null;
  isFeedback: boolean;
  droppedResidue: boolean;
  isButton: boolean;
  isChat: boolean;
  /** The last row that added to the label or field, for join decisions. */
  lastRow: ScreenRow;
  /** A row the reader could not place, such as label text after an inline description. */
  hasStrayRow: boolean;
}

/** The footer's key hints, `<key> to <action>` joined with ` · `. */
export interface ClaudeFooter {
  readonly rows: readonly ScreenRow[];
  readonly hints: readonly { key: string; action: string }[];
  /** Parts that are not hints, such as the plan file's path. */
  readonly extras: readonly string[];
}

export function readFooter(rows: readonly ScreenRow[]): ClaudeFooter {
  const text = rows.map(trimmedText).join(' ');
  const hints: { key: string; action: string }[] = [];
  const extras: string[] = [];
  for (const raw of text.split(' · ')) {
    const part = trimBlanks(raw);
    const split = part.indexOf(' to ');
    if (split >= 0) hints.push({ key: part.slice(0, split), action: part.slice(split + 4) });
    else if (part !== '') extras.push(part);
  }
  return { rows, hints, extras };
}

/**
 * A hint that binds an action the planner relies on to a key other than Claude's default: the
 * user remapped it, so the planned keys would not do what the card says.
 */
export function footerRebinding(footer: ClaudeFooter): string | null {
  for (const hint of footer.hints) {
    const key = hint.key.toLowerCase();
    let rebound: boolean;
    switch (hint.action.toLowerCase()) {
      case 'cancel':
        rebound = key !== 'esc';
        break;
      case 'amend':
        rebound = key !== 'tab';
        break;
      case 'select':
      case 'confirm':
        rebound = key !== 'enter';
        break;
      case 'navigate':
        rebound = !(key.includes('↑') || key.includes('arrow'));
        break;
      default:
        rebound = false;
    }
    if (rebound) return `${hint.key} to ${hint.action}`;
  }
  return null;
}

/** The tab bar over a question (`←  ☐ Colors  ☐ Size  ✔ Submit  →`) or a single header chip. */
export interface QuestionTabs {
  /** Question headers in order, without the Submit tab. */
  readonly headers: string[];
  /** The highlighted tab's label. */
  readonly active: string | null;
}

const TAB_GLYPHS = new Set(['☐', '☒', '✔']);

export function readQuestionTabs(row: ScreenRow): QuestionTabs | null {
  if (![...row.text].some((character) => TAB_GLYPHS.has(character))) return null;
  const tabs: { label: string; glyph: string; isActive: boolean }[] = [];
  for (const run of row.runs) {
    const highlighted = run.style.background !== null || run.style.isReverse;
    for (const character of run.text) {
      if (TAB_GLYPHS.has(character)) {
        tabs.push({ label: '', glyph: character, isActive: highlighted });
      } else if (character === '←' || character === '→') {
        // arrows at the ends of the bar
      } else {
        const last = tabs[tabs.length - 1];
        if (!last) continue;
        last.label += character;
        if (highlighted && !isBlankChar(character)) last.isActive = true;
      }
    }
  }
  const cleaned = tabs.map((tab) => ({ ...tab, label: trimBlanks(tab.label) }));
  if (cleaned.length === 0 || cleaned.some((tab) => tab.label === '')) return null;
  const headers = cleaned
    .filter((tab) => !(tab.glyph === '✔' && tab.label === 'Submit'))
    .map((tab) => tab.label);
  const highlightedTab = cleaned.find((tab) => tab.isActive)?.label;
  const onlyTab = cleaned.length === 1 ? cleaned[0]?.label : undefined;
  return { headers, active: highlightedTab ?? onlyTab ?? null };
}

/** The rows without blank rows at either end. */
export function trimBlankRows(rows: readonly ScreenRow[]): ScreenRow[] {
  let start = 0;
  while (
    start < rows.length &&
    rows[start]?.text !== undefined &&
    isBlankText(rows[start]?.text ?? '')
  ) {
    start += 1;
  }
  let end = rows.length;
  while (end > start && isBlankText(rows[end - 1]?.text ?? '')) end -= 1;
  return rows.slice(start, end);
}

/** Builds a generic-card excerpt for a Claude screen. */
export function claudeExcerpt(
  rows: readonly ScreenRow[],
  footerRows: ReadonlySet<number>,
  numbered: ReadonlyMap<number, string>,
  reason: Text,
): GenericDialogExcerpt {
  const trimmed = trimBlankRows(rows);
  return {
    rows: trimmed,
    numbered,
    reason,
    fingerprint: excerptFingerprint(
      'claude',
      trimmed.filter((row) => !footerRows.has(row.index)).map((row) => row.text),
    ),
    displayLines: null,
  };
}
