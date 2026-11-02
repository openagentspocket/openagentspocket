import { message, type Text } from '../errors/text';
import { readFieldText } from './claude-models';
import { locateCodexComposer } from './codex-extras';
import { dialog } from './codex-result';
import { type BlockRange, CodexRows } from './codex-rows';
import { excerptFingerprint } from './fingerprint';
import {
  CODEX_POINTER,
  isPointed,
  joinWrapped,
  numberedOption,
  permissionRole,
  runsFrom,
  splitShortcut,
} from './row-scanner';
import { type AnsiScreen, rowIndent, rowIsBlank, trimmedText, visibleRuns } from './screen';
import {
  type BlockedDialogKind,
  type DialogOption,
  type DialogParseResult,
  makeOption,
  makeSubject,
  NO_DIALOG,
} from './types';

const APPROVAL_FOOTER = 'Press enter to confirm or esc to cancel';
const QUESTION_HEADER = /^Question \d+\/\d+/;
const COLLAPSED_COUNT = /^\? \d+ questions?(?= · |$)/;

const valueAfter = (label: string, entry: string): string | null =>
  entry.startsWith(`${label}:`) ? entry.slice(label.length + 1).trim() : null;

/**
 * Reads Codex's approval overlays and question views from a visible-screen read. Codex styles by
 * attribute (bold, dim, reverse, italic) rather than by color, so the parser keys on attributes.
 * Each view is anchored by its footer; a view that does not fit comes back as an excerpt.
 */
export class CodexDialogReader {
  private readonly tools: CodexRows;

  constructor(private readonly screen: AnsiScreen) {
    this.tools = new CodexRows(screen);
  }

  read(): DialogParseResult {
    const { rows } = this.tools;
    let last = -1;
    for (let at = rows.length - 1; at >= 0; at -= 1) {
      if (!rowIsBlank(this.tools.at(at))) {
        last = at;
        break;
      }
    }
    if (last < 0) return NO_DIALOG;
    const footer: BlockRange = { first: this.tools.blockStart(last), last };
    const footerText = this.tools.slice(footer.first, last).map(trimmedText).join(' ');
    if (footerText.includes(APPROVAL_FOOTER)) return this.readApproval(footer);
    if (footerText.includes('enter submit') && footerText.includes('skip')) {
      return this.readAsyncQuestion(footer);
    }
    const composer = locateCodexComposer(this.screen);
    const questionRow = composer === null ? this.tools.questionHeaderRow(footer.first) : null;
    if (
      questionRow !== null &&
      ['to submit answer', 'to submit all', 'clear notes', 'esc to interrupt'].some((hint) =>
        footerText.includes(hint),
      )
    ) {
      return this.readQuestion(questionRow, footer);
    }
    const collapsed = this.readCollapsedQuestions();
    if (collapsed) return collapsed;
    if (composer !== null) return NO_DIALOG;
    return this.readLooseOptions(footer);
  }

  private readApproval(footer: BlockRange): DialogParseResult {
    const { tools } = this;
    const optionRange = tools.blockAbove(footer.first);
    if (!optionRange) {
      return this.unrecognized(null, footer, message("The approval's options are not on screen."));
    }
    const drafts = tools.readOptions(optionRange.first, optionRange.last, false);
    const title = tools.titleAbove(optionRange.first);
    if (!title) {
      return this.unrecognized(null, footer, message('The top of the approval is off screen.'));
    }
    const top = title.first;
    const fail = (reason: Text) => this.unrecognized(top, footer, reason);
    if (!drafts) return fail(message("The approval's options could not be read."));

    let kind: BlockedDialogKind;
    const subject = makeSubject();
    if (title.text === 'Would you like to run the following command?') kind = 'codexExec';
    else if (title.text === 'Would you like to make the following edits?') kind = 'codexPatch';
    else if (title.text.startsWith('Do you want to approve network access to')) {
      kind = 'codexNetwork';
      subject.host = title.text.split('"').filter((part) => part !== '')[1] ?? null;
    } else {
      return fail(message('Agentico does not know the approval “%@”.', title.text));
    }

    const options: DialogOption[] = [];
    for (const [index, draft] of drafts.entries()) {
      const { label, shortcut } = splitShortcut(draft.label);
      const role = permissionRole(label, shortcut);
      if (role === null) {
        return fail(
          message(
            'Option %@ reads “%@”, which is not a label Agentico knows.',
            String(draft.number),
            label,
          ),
        );
      }
      options.push(
        makeOption({
          ordinal: index + 1,
          number: draft.number,
          label,
          shortcut,
          role,
          isFocused: draft.isFocused,
        }),
      );
    }
    if (
      !options.some((option) => option.role === 'decline') ||
      !options.some((option) => option.role !== 'decline')
    ) {
      return fail(message('The approval lacks a Yes or a No option.'));
    }

    const entries = tools.headerEntries(title.end, optionRange.first);
    for (const entry of entries) {
      const reason = valueAfter('Reason', entry);
      const environment = valueAfter('Environment', entry);
      const destination = valueAfter('Destination', entry);
      if (entry.startsWith('$ ')) subject.command = entry.slice(2);
      else if (reason !== null) subject.reason = reason;
      else if (environment !== null) subject.environment = environment;
      else if (destination !== null) subject.destinations.push(destination);
    }
    subject.filePath = subject.destinations[0] ?? null;
    return dialog({
      kind,
      title: title.text,
      positionLabel: null,
      body: entries,
      progress: null,
      options,
      first: top,
      end: footer.last + 1,
      subject,
    });
  }

  private readQuestion(headerRow: number, footer: BlockRange): DialogParseResult {
    const { tools } = this;
    const fail = (reason: Text) => this.unrecognized(headerRow, footer, reason);
    const progress = QUESTION_HEADER.exec(trimmedText(tools.at(headerRow)))?.[0] ?? null;
    let titleEnd = footer.first;
    for (let at = headerRow + 1; at < footer.first; at += 1) {
      if (rowIsBlank(tools.at(at))) {
        titleEnd = at;
        break;
      }
    }
    const title = tools.joinRows(tools.slice(headerRow + 1, titleEnd - 1));
    let optionStart = -1;
    for (let at = titleEnd; at < footer.first; at += 1) {
      if (!rowIsBlank(tools.at(at))) {
        optionStart = at;
        break;
      }
    }
    if (title === '' || optionStart < 0)
      return fail(message("The question's options are not on screen."));
    let optionEnd = footer.first;
    for (let at = optionStart; at < footer.first; at += 1) {
      if (rowIsBlank(tools.at(at))) {
        optionEnd = at;
        break;
      }
    }
    const drafts = tools.readOptions(optionStart, optionEnd - 1, true);
    if (!drafts) return fail(message("The question's options could not be read."));

    // A notes field opens between the options and the footer on Tab: `›` and the text, or a dim
    // `Add notes` while blank. A long note wraps under its first row.
    let notes: string | null = null;
    let notesIndent = 0;
    let lastNotesRow = null as ReturnType<CodexRows['at']> | null;
    for (let index = optionEnd; index < footer.first; index += 1) {
      const row = tools.at(index);
      if (rowIsBlank(row)) continue;
      const indent = rowIndent(row) ?? 0;
      if (lastNotesRow) {
        if (!(indent > notesIndent)) {
          return fail(message('Rows between the options and the footer are unknown.'));
        }
        notes = joinWrapped(
          notes ?? '',
          trimmedText(row),
          'codex',
          lastNotesRow,
          tools.columns,
          indent,
        );
        lastNotesRow = row;
        continue;
      }
      if (!trimmedText(row).startsWith('›')) {
        return fail(message('Rows between the options and the footer are unknown.'));
      }
      notesIndent = indent;
      lastNotesRow = row;
      const field = readFieldText(runsFrom(row, indent + 1));
      notes = field.kind === 'typed' ? field.text : '';
    }

    const options = drafts.map((draft, index) =>
      makeOption({
        ordinal: index + 1,
        number: draft.number,
        label: draft.label,
        detail: draft.detail,
        role: draft.label === 'None of the above' ? 'otherText' : 'answer',
        isFocused: draft.isFocused,
      }),
    );
    if (!options.some((option) => option.role === 'answer')) {
      return fail(message('The question has no answers Agentico can read.'));
    }
    const subject = makeSubject();
    subject.question = title;
    return dialog({
      kind: 'codexQuestion',
      title,
      positionLabel: null,
      body: [],
      progress,
      options,
      first: headerRow,
      end: footer.last + 1,
      subject,
      notes,
    });
  }

  private readAsyncQuestion(footer: BlockRange): DialogParseResult {
    const { tools } = this;
    const optionRange = tools.blockAbove(footer.first);
    const titleBlock = optionRange ? tools.blockAbove(optionRange.first) : null;
    if (!optionRange || !titleBlock) {
      return this.unrecognized(null, footer, message('The question is not on screen.'));
    }
    const top = titleBlock.first;
    const fail = (reason: Text) => this.unrecognized(top, footer, reason);
    let positionLabel: string | null = null;
    const titleRows = [];
    for (const row of tools.slice(titleBlock.first, titleBlock.last)) {
      const text = trimmedText(row);
      if (titleRows.length === 0 && /^\d+ of \d+$/.test(text)) {
        positionLabel = text;
      } else if (visibleRuns(row).every((run) => run.style.isBold)) {
        titleRows.push(row);
      } else {
        return fail(message("The question's title could not be read."));
      }
    }
    const title = tools.joinRows(titleRows);
    const drafts = tools.readOptions(optionRange.first, optionRange.last, false);
    if (title === '' || !drafts) return fail(message("The question's options could not be read."));
    const options = drafts.map((draft, index) =>
      makeOption({
        ordinal: index + 1,
        number: draft.number,
        label: draft.label,
        role: draft.label === 'Other' ? 'otherText' : 'answer',
        isFocused: draft.isFocused,
      }),
    );
    const subject = makeSubject();
    subject.question = title;
    return dialog({
      kind: 'codexAsyncQuestion',
      title,
      positionLabel,
      body: [],
      progress: title,
      options,
      first: top,
      end: footer.last + 1,
      subject,
    });
  }

  /**
   * `? 2 questions` with `shift+← to answer` under Codex's queued inputs: questions waiting while
   * the turn runs. The countdown Codex 0.162.1 adds stays out of the title.
   */
  private readCollapsedQuestions(): DialogParseResult | null {
    const { tools } = this;
    let countRow = -1;
    for (let at = tools.rows.length - 1; at >= 0; at -= 1) {
      if (COLLAPSED_COUNT.test(trimmedText(tools.at(at)))) {
        countRow = at;
        break;
      }
    }
    if (countRow < 0) return null;
    const hintRow = tools.rows
      .slice(countRow + 1, countRow + 3)
      .find((row) => trimmedText(row).includes('to answer'));
    const count = COLLAPSED_COUNT.exec(trimmedText(tools.at(countRow)));
    if (!hintRow || !count) return null;
    const title = count[0].slice(2);
    const top =
      countRow > 0 && trimmedText(tools.at(countRow - 1)).includes('Queued follow-up inputs')
        ? countRow - 1
        : countRow;
    return dialog({
      kind: 'codexAsyncCollapsed',
      title,
      positionLabel: null,
      body: [],
      progress: null,
      options: [],
      first: top,
      end: hintRow.index + 1,
      subject: makeSubject(),
    });
  }

  /** Numbered rows with a pointer near the bottom and no composer: a list Agentico does not know. */
  private readLooseOptions(footer: BlockRange): DialogParseResult {
    const { tools } = this;
    const start = Math.max(0, footer.last - 30);
    const numbered = [];
    for (let index = start; index <= footer.last; index += 1) {
      const option = numberedOption(tools.at(index), CODEX_POINTER);
      if (option) numbered.push(option);
    }
    const pointed = [...numbered].reverse().find(isPointed);
    if (!pointed || !tools.at(pointed.rowIndex).runs.some((run) => run.style.isReverse)) {
      return NO_DIALOG;
    }
    let top = Math.min(pointed.rowIndex, Math.max(0, footer.last - 16));
    for (let index = pointed.rowIndex - 1; index >= start; index -= 1) {
      if (rowIsBlank(tools.at(index)) && (index === 0 || rowIsBlank(tools.at(index - 1)))) {
        top = index + 1;
        break;
      }
    }
    return this.unrecognized(top, footer, message('Agentico does not know this list.'));
  }

  private unrecognized(top: number | null, footer: BlockRange, reason: Text): DialogParseResult {
    const { tools } = this;
    const start = top ?? Math.max(0, footer.first - 16);
    let from = start;
    while (from <= footer.last && rowIsBlank(tools.at(from))) from += 1;
    const excerptRows = tools.slice(from, footer.last);
    const fingerprintRows = excerptRows
      .filter((row) => row.index < footer.first || row.index > footer.last)
      .map((row) => row.text);
    return {
      kind: 'unrecognized',
      excerpt: {
        rows: excerptRows,
        numbered: tools.numberedOptions(footer, start),
        reason,
        fingerprint: excerptFingerprint('codex', fingerprintRows),
        displayLines: null,
      },
    };
  }
}
