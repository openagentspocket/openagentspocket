import type { ClaudeRows } from './claude-rows';
import { isRule } from './row-scanner';
import {
  isBlankRun,
  normalizedSpaces,
  rowIndent,
  rowIsBlank,
  type ScreenRow,
  trimBlanks,
  trimmedText,
} from './screen';
import type { ReviewAnswer } from './types';

export interface TitleRow {
  text: string;
  suffix: string | null;
  position: string | null;
}

/** A title row: the bold text at its start, then an optional ` · from …` and a `1 of N`. */
export function readTitleRow(row: ScreenRow): TitleRow {
  let title = '';
  let rest = '';
  let inTitle = true;
  for (const run of row.runs) {
    if (inTitle && (run.style.isBold || (isBlankRun(run) && trimBlanks(title) === ''))) {
      title += run.text;
      continue;
    }
    inTitle = false;
    rest += run.text;
  }
  let remainder = trimBlanks(normalizedSpaces(rest));
  let position: string | null = null;
  const match = /\d+ of \d+$/.exec(remainder);
  if (match) {
    position = match[0];
    remainder = trimBlanks(remainder.slice(0, match.index));
  }
  if (remainder.startsWith('·')) remainder = trimBlanks(remainder.slice(1));
  return { text: trimBlanks(title), suffix: remainder === '' ? null : remainder, position };
}

export interface BodySections {
  before: string[];
  content: ScreenRow[];
  after: string[];
}

/** Region helpers of Claude's dialogs, over the shared row tools. */
export class ClaudeRegions {
  constructor(private readonly tools: ClaudeRows) {}

  /** The nearest full-width `─` rule above `row`: the dialog's top, or the plan's lower box. */
  topRule(row: number): number | null {
    for (let index = row - 1; index >= 0; index -= 1) {
      const candidate = this.tools.at(index);
      if (isRule(candidate, '─', this.tools.fullWidth) && (rowIndent(candidate) ?? 0) <= 2) {
        return index;
      }
    }
    return null;
  }

  /** Rows between a permission dialog's title and its options, split by the `╌` rules. */
  bodySections(start: number, end: number): BodySections {
    const { tools } = this;
    let index = start;
    if (
      index < end &&
      tools.isBoldRow(tools.at(index)) &&
      trimmedText(tools.at(index)).startsWith('Tip:')
    ) {
      index += 1;
      while (index < end && tools.isBoldRow(tools.at(index))) index += 1;
    }
    const dashed: number[] = [];
    for (let at = index; at < end; at += 1) {
      if (isRule(tools.at(at), '╌', tools.fullWidth)) dashed.push(at);
    }
    const open = dashed[0];
    if (open === undefined) return { before: tools.paragraphs(index, end), content: [], after: [] };
    const close = dashed[1] ?? end;
    const content: ScreenRow[] = [];
    for (let at = open + 1; at < close; at += 1) content.push(tools.at(at));
    return {
      before: tools.paragraphs(index, open),
      content,
      after: close < end ? tools.paragraphs(close + 1, end) : [],
    };
  }

  /** The plan's upper box: its title and plan rows, as far as the screen shows them. */
  planUpperBox(lowerRule: number): {
    title: string | null;
    planRows: string[];
    top: number | null;
  } {
    const { tools } = this;
    let index = lowerRule - 1;
    while (index >= 0 && rowIsBlank(tools.at(index))) index -= 1;
    if (index < 0 || !isRule(tools.at(index), '╌', tools.fullWidth)) {
      return { title: null, planRows: [], top: null };
    }
    const close = index;
    index -= 1;
    while (index >= 0 && !isRule(tools.at(index), '╌', tools.fullWidth)) index -= 1;
    const planRows: string[] = [];
    for (let at = Math.max(index + 1, 0); at < close; at += 1) {
      const text = trimmedText(tools.at(at));
      if (text !== '') planRows.push(text);
    }
    if (index < 0) return { title: null, planRows, top: null };
    let titleIndex: number | null = null;
    for (let at = index - 1; at >= Math.max(0, index - 6); at -= 1) {
      if (tools.isBoldRow(tools.at(at))) {
        titleIndex = at;
        break;
      }
    }
    let top: number | null = null;
    if (titleIndex !== null) {
      for (let at = titleIndex - 1; at >= Math.max(0, titleIndex - 3); at -= 1) {
        if (tools.isRuleRow(tools.at(at))) {
          top = at;
          break;
        }
      }
    }
    return {
      title: titleIndex === null ? null : trimmedText(tools.at(titleIndex)),
      planRows,
      top: top ?? titleIndex,
    };
  }

  /** ` ● <question>` and `   → <answer>` pairs; a row indented past the marker continues the text. */
  reviewAnswers(from: number, to: number): ReviewAnswer[] {
    const answers: ReviewAnswer[] = [];
    let open: { isAnswer: boolean; indent: number } | null = null;
    for (let index = from; index < to; index += 1) {
      const row = this.tools.at(index);
      const text = trimmedText(row);
      const indent = rowIndent(row) ?? 0;
      const last = answers[answers.length - 1];
      if (text.startsWith('●')) {
        answers.push({ question: trimBlanks(text.slice(1)), answer: '' });
        open = { isAnswer: false, indent };
      } else if (text.startsWith('→') && last) {
        last.answer = trimBlanks(text.slice(1));
        open = { isAnswer: true, indent };
      } else if (open && text !== '' && indent > open.indent && last) {
        if (open.isAnswer) last.answer += ` ${text}`;
        else last.question += ` ${text}`;
      } else {
        open = null;
      }
    }
    return answers;
  }

  /** `url:` and `prompt:` entries, wrapped rows joined to their entry. */
  labeledEntries(content: readonly ScreenRow[], labels: readonly string[]): string[] {
    const entries: { text: string; row: ScreenRow }[] = [];
    for (const row of content) {
      if (rowIsBlank(row)) continue;
      const text = trimmedText(row);
      const last = entries[entries.length - 1];
      if (!last || labels.some((label) => text.startsWith(label))) {
        entries.push({ text, row });
      } else {
        last.text = this.tools.join(last.text, text, last.row, rowIndent(row) ?? 0);
        last.row = row;
      }
    }
    return entries.map((entry) => entry.text);
  }
}
