import { message, type Text } from '../errors/text';
import {
  type ClaudeFooter,
  emptyReading,
  type FieldText,
  footerRebinding,
  type OptionDraft,
  type OptionRowReading,
  readFieldText,
  readFooter,
} from './claude-models';
import type { ClaudeRows } from './claude-rows';
import {
  CLAUDE_POINTER,
  isLabeledRule,
  isPointed,
  isRule,
  type NumberedOptionRow,
  numberedOption,
  runsFrom,
  wouldFitFirstWord,
} from './row-scanner';
import {
  firstChar,
  isBlankChar,
  isBlankRun,
  normalizedSpaces,
  rowIndent,
  rowIsBlank,
  type ScreenRow,
  type ScreenRun,
  sameColor,
  trimBlanks,
} from './screen';

export interface OptionScan {
  drafts: OptionDraft[];
  /** The first row after the options. */
  end: number;
  footer: ClaudeFooter | null;
  problem: Text | null;
  /** The last row the dialog covers. */
  lastRow: number;
}

const joinRuns = (runs: readonly ScreenRun[]): string => runs.map((run) => run.text).join('');

/** `[ ] `, `[✔] ` and the like at the start of a multi-select option. */
function checkbox(text: string): { isChecked: boolean; width: number } | null {
  const characters = [...text].slice(0, 4);
  const [open, mark, close, space] = characters;
  if (characters.length !== 4 || open !== '[' || close !== ']' || !space || !isBlankChar(space)) {
    return null;
  }
  if (mark === ' ') return { isChecked: false, width: 4 };
  if (mark && ['✔', '✓', 'x', 'X', '×'].includes(mark)) return { isChecked: true, width: 4 };
  return null;
}

/** Reads Claude's option rows, their wrapped continuations and the footer under them. */
export class ClaudeOptionReader {
  constructor(private readonly tools: ClaudeRows) {}

  private get block() {
    return this.tools.block;
  }

  /**
   * Reads the options from the first numbered row down, then the footer. Null when rows after the
   * options do not look like a footer, which means the block is not a live dialog.
   */
  scan(first: number, isQuestionPage: boolean): OptionScan | null {
    const { rows } = this.tools;
    const drafts: OptionDraft[] = [];
    const numbered = [...this.block.rows];
    let sawInnerRule = false;
    let row = first;
    while (row < rows.length) {
      const current = this.tools.at(row);
      const next = numbered[0];
      const button = isQuestionPage && !sawInnerRule ? this.buttonRow(current) : null;
      const lastNumber = [...drafts].reverse().find((draft) => draft.number !== null)?.number ?? 0;
      const chat = isQuestionPage && sawInnerRule ? numberedOption(current, CLAUDE_POINTER) : null;
      if (next && next.rowIndex === row) {
        drafts.push(this.readNumbered(next, isQuestionPage, false));
        numbered.shift();
      } else if (rowIsBlank(current)) {
        break;
      } else if (button) {
        drafts.push(button);
      } else if (isQuestionPage && isRule(current, '─', this.tools.fullWidth)) {
        sawInnerRule = true;
      } else if (chat && chat.number === lastNumber + 1) {
        drafts.push(this.readNumbered(chat, true, true));
      } else {
        // Verbatim from Swift: the last draft is taken off the list while the row is tested as
        // its continuation, and put back only when it is one.
        const last = drafts.pop();
        const indent = rowIndent(current);
        if (last && !last.isButton && indent !== null && indent >= last.labelColumn) {
          this.continueOption(last, current);
          drafts.push(last);
        } else {
          break;
        }
      }
      row += 1;
    }
    const scan: OptionScan = { drafts, end: row, footer: null, problem: null, lastRow: row - 1 };
    const unplaced = numbered[0];
    if (unplaced) {
      scan.problem = message('Option %@ is not where the list continues.', String(unplaced.number));
    }
    if (!this.readFooterRows(scan, row)) return null;
    const stray = drafts.findIndex((draft) => draft.hasStrayRow);
    if (scan.problem === null && stray >= 0) {
      scan.problem = message('Option %@ has a row Agentico could not place.', String(stray + 1));
    }
    return scan;
  }

  /** Reads the footer under the options into `scan`; false when the rows are not a footer. */
  private readFooterRows(scan: OptionScan, from: number): boolean {
    const { rows, fullWidth } = this.tools;
    const footerRows: ScreenRow[] = [];
    let index = from;
    let sawSessionRule = false;
    // Claude Code 2.1.301 draws a rule that carries the session's name under the dialog.
    const skipSessionRule = () => {
      if (sawSessionRule || index >= rows.length) return;
      if (!isLabeledRule(this.tools.at(index), '─', fullWidth)) return;
      sawSessionRule = true;
      index += 1;
    };
    while (index < rows.length && rowIsBlank(this.tools.at(index))) index += 1;
    while (index < rows.length && !rowIsBlank(this.tools.at(index))) {
      skipSessionRule();
      if (sawSessionRule) break;
      const row = this.tools.at(index);
      if (!this.tools.isInactiveRow(row)) return false;
      footerRows.push(row);
      index += 1;
    }
    while (index < rows.length && rowIsBlank(this.tools.at(index))) index += 1;
    skipSessionRule();
    if (!rows.slice(index).every(rowIsBlank)) return false;
    if (footerRows.length > 0) {
      const footer = readFooter(footerRows);
      scan.footer = footer;
      const rebinding = footerRebinding(footer);
      if (scan.problem === null && rebinding !== null) {
        scan.problem = message(
          "The footer shows “%@”; Agentico only sends Claude's default keys.",
          rebinding,
        );
      }
    }
    scan.lastRow = footerRows[footerRows.length - 1]?.index ?? scan.end - 1;
    return true;
  }

  readNumbered(numbered: NumberedOptionRow, isQuestionPage: boolean, isChat: boolean): OptionDraft {
    const row = this.tools.at(numbered.rowIndex);
    let runs = runsFrom(row, numbered.labelColumn);
    let isChecked: boolean | null = null;
    const box = isQuestionPage ? checkbox(joinRuns(runs)) : null;
    if (box) {
      isChecked = box.isChecked;
      runs = runsFrom(row, numbered.labelColumn + box.width);
    }
    const reading = this.readRuns(runs);
    const draft: OptionDraft = {
      number: numbered.number,
      rowIndex: numbered.rowIndex,
      labelColumn: numbered.labelColumn,
      isFocused: isPointed(numbered),
      isChecked,
      label: reading.feedbackLabel ?? reading.label,
      labelIsInactive: reading.labelIsInactive,
      detail: reading.detail,
      field: reading.field,
      isFeedback: reading.feedbackLabel !== null,
      droppedResidue: reading.droppedResidue,
      isButton: false,
      isChat,
      lastRow: row,
      hasStrayRow: false,
    };
    if (reading.isMarkedChosen) draft.isChecked = true;
    return draft;
  }

  /** An unnumbered button under a multi-select question (`Next`, `Submit`): bold text. */
  private buttonRow(row: ScreenRow): OptionDraft | null {
    if (numberedOption(row, CLAUDE_POINTER) !== null) return null;
    const pointed = firstChar(row.text) === CLAUDE_POINTER;
    const runs = row.runs.filter((run) => !isBlankRun(run) && !(pointed && run.column === 0));
    const label = trimBlanks(joinRuns(runs));
    if (runs.length === 0 || !runs.every((run) => run.style.isBold)) return null;
    if (label === '' || label.includes(' ')) return null;
    return {
      number: null,
      rowIndex: row.index,
      labelColumn: runs[0]?.column ?? 0,
      isFocused: pointed,
      isChecked: null,
      label,
      labelIsInactive: false,
      detail: null,
      field: null,
      isFeedback: false,
      droppedResidue: false,
      isButton: true,
      isChat: false,
      lastRow: row,
      hasStrayRow: false,
    };
  }

  /** Adds a row below an option's first row: a wrapped label or field, or a description. */
  private continueOption(draft: OptionDraft, row: ScreenRow): void {
    const runs = runsFrom(row, draft.labelColumn);
    const text = joinRuns(runs);
    const visible = runs.filter((run) => !isBlankRun(run));
    const inactive = this.block.inactive;
    const allInactive =
      visible.length > 0 && visible.every((run) => sameColor(run.style.foreground, inactive));
    if (allInactive) {
      const wrapsPlaceholder =
        draft.field === null &&
        draft.detail === null &&
        draft.labelIsInactive &&
        !wouldFitFirstWord(text, draft.lastRow, this.tools.columns);
      if (wrapsPlaceholder) {
        draft.label = this.tools.join(draft.label, text, draft.lastRow, draft.labelColumn);
        draft.lastRow = row;
      } else {
        const trimmed = trimBlanks(text);
        draft.detail =
          draft.detail === null
            ? trimmed
            : draft.detail === ''
              ? trimmed
              : `${draft.detail} ${trimmed}`;
      }
      return;
    }
    if (draft.detail !== null) {
      draft.hasStrayRow = true;
      return;
    }
    if (draft.field) {
      if (draft.field.kind === 'typed') {
        const addition = readFieldText(runs).text;
        draft.field = {
          kind: 'typed',
          text: this.tools.join(draft.field.text, addition, draft.lastRow, draft.labelColumn),
        };
      } else {
        draft.field = {
          kind: 'placeholder',
          text: this.tools.join(draft.field.text, text, draft.lastRow, draft.labelColumn),
        };
      }
      draft.lastRow = row;
      return;
    }
    const reading = this.readRuns(runs);
    draft.label = this.tools.join(draft.label, reading.label, draft.lastRow, draft.labelColumn);
    draft.lastRow = row;
    if (reading.droppedResidue) draft.droppedResidue = true;
    if (reading.detail !== null) draft.detail = trimBlanks(reading.detail);
  }

  /**
   * Splits an option row's runs into label, inline description and field. The label is the
   * default- or accent-colored text after the number; an inactive run is a description only after
   * ` · `. Any other inactive run after the label is residue a narrow redraw left behind.
   */
  readRuns(runs: readonly ScreenRun[]): OptionRowReading {
    if (runs.some((run) => run.style.isReverse)) return this.readField(runs);
    const note = this.noteWithoutCursor(runs);
    if (note) return note;
    const reading = emptyReading();
    let detail: string | null = null;
    for (const run of runs) {
      if (detail !== null) {
        detail += run.text;
        continue;
      }
      if (isBlankRun(run)) {
        reading.label += run.text;
        continue;
      }
      if (sameColor(run.style.foreground, this.block.inactive)) {
        const text = [...run.text];
        while (text.length > 0 && isBlankChar(text[0] ?? '')) text.shift();
        if (text[0] === '·') {
          detail = text.slice(1).join('');
          continue;
        }
        if (reading.labelIsInactive || [...reading.label].every(isBlankChar)) {
          reading.labelIsInactive = true;
          reading.label += run.text;
          continue;
        }
        reading.droppedResidue = true;
        break;
      }
      if (reading.labelIsInactive) {
        reading.droppedResidue = true;
        break;
      }
      reading.label += run.text;
    }
    let label = trimBlanks(normalizedSpaces(reading.label));
    if (label.endsWith(' ✔')) {
      label = label.slice(0, -2);
      reading.isMarkedChosen = true;
    }
    reading.label = label;
    reading.detail = detail === null ? null : trimBlanks(normalizedSpaces(detail));
    return reading;
  }

  /** A row with the cursor in it: a text field, or a `Yes`/`No` row Tab turned into a note field. */
  private readField(runs: readonly ScreenRun[]): OptionRowReading {
    const reading = emptyReading();
    const visible = runs
      .map((run, offset) => ({ run, offset }))
      .filter(({ run }) => !isBlankRun(run) && !run.style.isReverse);
    const first = visible[0];
    const cursor = runs.findIndex((run) => run.style.isReverse);
    const accent = this.block.accent;
    if (
      accent &&
      first &&
      sameColor(first.run.style.foreground, accent) &&
      first.offset < Math.max(cursor, 0)
    ) {
      const label = trimBlanks(first.run.text);
      if (label.endsWith(',')) {
        reading.feedbackLabel = label.slice(0, -1);
        reading.label = label.slice(0, -1);
        reading.field = readFieldText(runs.slice(first.offset + 1));
        return reading;
      }
    }
    const field: FieldText = readFieldText(runs);
    reading.field = field;
    if (field.kind === 'placeholder') reading.label = field.text;
    return reading;
  }

  /**
   * The first row of a note too long for its row, which leaves the cursor cell out: `No, ` in the
   * accent color, then the note's start, wrapped onto the next rows or cut off with `…`.
   */
  private noteWithoutCursor(runs: readonly ScreenRun[]): OptionRowReading | null {
    const visible = runs
      .map((run, offset) => ({ run, offset }))
      .filter(({ run }) => !isBlankRun(run));
    const first = visible[0];
    const accent = this.block.accent;
    if (
      !accent ||
      !first ||
      !sameColor(first.run.style.foreground, accent) ||
      visible.length <= 1
    ) {
      return null;
    }
    const label = trimBlanks(first.run.text);
    const rest = runs.slice(first.offset + 1);
    const restIsNote = rest.every(
      (run) =>
        isBlankRun(run) ||
        (!sameColor(run.style.foreground, accent) &&
          !sameColor(run.style.foreground, this.block.inactive)),
    );
    if (!label.endsWith(',') || !restIsNote) return null;
    const reading = emptyReading();
    reading.feedbackLabel = label.slice(0, -1);
    reading.label = label.slice(0, -1);
    reading.field = readFieldText(rest);
    return reading;
  }
}
