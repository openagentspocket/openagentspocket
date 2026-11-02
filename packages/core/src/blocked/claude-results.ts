import type { Text } from '../errors/text';
import { claudeExcerpt } from './claude-models';
import type { ClaudeOptionReader, OptionScan } from './claude-options';
import type { ClaudeRows } from './claude-rows';
import { dialogFingerprint } from './fingerprint';
import { CLAUDE_POINTER, numberedOption, runsFrom } from './row-scanner';
import { rowIsBlank } from './screen';
import {
  type BlockedDialogKind,
  type DialogOption,
  type DialogParseResult,
  type DialogSubject,
  makeFocus,
} from './types';

export interface DialogParts {
  kind: BlockedDialogKind;
  title: string;
  sourceSuffix: string | null;
  positionLabel: string | null;
  body: string[];
  progress: string | null;
  options: DialogOption[];
  top: number;
  scan: OptionScan;
  subject: DialogSubject;
}

/** Builds the two kinds of result a Claude reader returns. */
export class ClaudeResults {
  constructor(
    private readonly tools: ClaudeRows,
    private readonly options: ClaudeOptionReader,
  ) {}

  dialog(parts: DialogParts): DialogParseResult {
    const { options, scan } = parts;
    const focused = options.find((option) => option.isFocused);
    const feedbackIndex = scan.drafts.findIndex((draft) => draft.isFeedback);
    const focus = makeFocus({
      focusedOrdinal: focused?.ordinal ?? null,
      checked: options
        .filter((option) => option.isChecked === true)
        .map((option) => option.ordinal),
      inputText: focused?.input?.kind === 'text' ? focused.input.text : null,
      feedbackOrdinal: (feedbackIndex >= 0 ? options[feedbackIndex]?.ordinal : undefined) ?? null,
    });
    return {
      kind: 'dialog',
      dialog: {
        kind: parts.kind,
        program: 'claude',
        title: parts.title,
        sourceSuffix: parts.sourceSuffix,
        positionLabel: parts.positionLabel,
        body: parts.body,
        progress: parts.progress,
        options,
        rows: { lowerBound: parts.top, upperBound: scan.lastRow + 1 },
        fingerprint: dialogFingerprint({
          program: 'claude',
          kind: parts.kind,
          title: parts.title,
          sourceSuffix: parts.sourceSuffix,
          body: parts.body,
          progress: parts.progress,
          options,
        }),
        focus,
        subject: parts.subject,
        note: null,
      },
    };
  }

  /**
   * The generic card for the rows from `top`. Without `offersDigits` it offers no option buttons,
   * only the key pad: in Claude's preview layout a digit only moves the focus.
   */
  unrecognized(
    top: number | null,
    reason: Text,
    scan: OptionScan | null = null,
    offersDigits = true,
  ): DialogParseResult {
    const { rows } = this.tools;
    const blockRows = this.tools.block.rows;
    const firstOption = blockRows[0]?.rowIndex ?? 0;
    const start = top ?? Math.max(0, firstOption - 12);
    const lastOptionRow = blockRows[blockRows.length - 1]?.rowIndex ?? firstOption;
    const end = scan ? Math.max(scan.lastRow, lastOptionRow) : this.lastFooterRow(lastOptionRow);
    const numbered = new Map<number, string>();
    if (offersDigits) {
      for (let index = start; index <= end; index += 1) {
        const row = this.tools.at(index);
        const option = numberedOption(row, CLAUDE_POINTER);
        // Option numbers carry a color; numbers in a plan or command do not.
        if (!option || option.numberStyle.foreground === null) continue;
        numbered.set(option.number, this.options.readRuns(runsFrom(row, option.labelColumn)).label);
      }
    }
    const footerRows = new Set(scan?.footer?.rows.map((row) => row.index) ?? []);
    return {
      kind: 'unrecognized',
      excerpt: claudeExcerpt(rows.slice(start, end + 1), footerRows, numbered, reason),
    };
  }

  /** The last non-blank row of the trailing block after `row`. */
  private lastFooterRow(row: number): number {
    let last = row;
    for (let index = row + 1; index < this.tools.rows.length; index += 1) {
      if (!rowIsBlank(this.tools.at(index))) last = index;
    }
    return last;
  }
}
