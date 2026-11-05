// A Grok Build question card's rows (Swift GrokDialogParser's answer sheet): the question's text,
// then any description, above the answers keyed from `1` and the typed answer's `z` row; the status
// row that says a turn waits on them; and the `/fork` question's rows.

import type { GrokCard, GrokLine } from './grok-card';
import { rowIndent, type ScreenRow, trimBlanks, trimmedText } from './screen';
import { type DialogOption, makeOption } from './types';

const trimmed = (text: string) => trimBlanks(text);

export const FORK_QUESTION = 'Run this fork in an isolated git worktree?';
export const FORK_ROWS = [
  { key: '1', label: 'Yes', offered: true },
  { key: '2', label: 'No', offered: true },
  { key: '3', label: 'Always worktree', offered: false },
  { key: '4', label: 'Never worktree', offered: false },
] as const;

/** The keys Grok draws on a question's answers, in order (`question_view.rs` `option_shortcut_label`). It binds only `1` to `f`. */
export const ANSWER_KEYS = [...'123456789abcdefghijklmnopqrstuvwxy'];
export const FREE_TEXT_KEY = 'z';
export const FREE_TEXT_LABEL = 'Type your answer here';
export const WAITING_LABEL = 'Waiting on answers for ';
export interface Answer {
  key: string;
  label: string[];
  detail: string[];
  line: number;
  column: number;
}

/** A question card's rows: the question's text, then any description, above the answers keyed from `1` and the typed answer's `z` row. */
export interface AnswerSheet {
  question: string;
  description: string[];
  answers: Answer[];
  /** The line of the `z` row. */
  field: number;
}

export function answerSheet(card: GrokCard): AnswerSheet | null {
  const first = card.lines.findIndex((line) => line.option !== null);
  if (first < 0) return null;
  const all = card.lines.slice(0, first).map((line) => line.text);
  const head = all.slice([...all.keys()].find((index) => all[index] !== '') ?? all.length);
  const prefixLength = head.indexOf('');
  const text = prefixLength < 0 ? head : head.slice(0, prefixLength);
  const question = text.join(' ');
  if (question === '') return null;
  const description = head.slice(text.length).filter((line) => line !== '');

  const answers: Answer[] = [];
  let field: number | null = null;
  for (let index = first; index < card.lines.length; index += 1) {
    const line = card.lines[index] as GrokLine;
    const option = line.option;
    if (option !== null) {
      if (field !== null || [...option.key].length !== 1) return null;
      if (option.key === FREE_TEXT_KEY) {
        if (option.label !== FREE_TEXT_LABEL || option.detail !== null || answers.length === 0) {
          return null;
        }
        field = index;
        continue;
      }
      const key = ANSWER_KEYS.indexOf(option.key);
      const previous = answers[answers.length - 1];
      if (key < 0 || (previous !== undefined && ANSWER_KEYS.indexOf(previous.key) !== key - 1)) {
        return null;
      }
      answers.push({
        key: option.key,
        label: [option.label],
        detail: option.detail === null ? [] : [option.detail],
        line: index,
        column: line.column,
      });
    } else if (line.text === '') {
    } else if (
      field === null &&
      answers.length > 0 &&
      line.column > (answers[answers.length - 1] as Answer).column
    ) {
      // The cursor's answer wraps: its label bold, its description not.
      const last = answers[answers.length - 1] as Answer;
      if (line.isBold && last.detail.length === 0) last.label.push(line.text);
      else last.detail.push(line.text);
    } else if (field !== null && line.text.startsWith('↑/↓')) {
    } else {
      // A counter for several questions, or a row Agentico doesn't know.
      return null;
    }
  }
  return field === null ? null : { question, description, answers, field };
}

export function answerOption(answer: Answer, ordinal: number, focused: boolean): DialogOption {
  return makeOption({
    ordinal,
    number: /^\d+$/.test(answer.key) ? Number(answer.key) : null,
    label: answer.label.join(' '),
    detail: answer.detail.length === 0 ? null : answer.detail.join(' '),
    shortcut: answer.key,
    role: 'answer',
    isFocused: focused,
  });
}

export const freeTextOption = (ordinal: number, focused: boolean): DialogOption =>
  makeOption({
    ordinal,
    number: null,
    label: FREE_TEXT_LABEL,
    shortcut: FREE_TEXT_KEY,
    role: 'otherText',
    isFocused: focused,
    input: { kind: 'placeholder', text: FREE_TEXT_LABEL },
  });

/**
 * The turn's status row above the card: `◆ Waiting on answers for <question>`, which a narrow row
 * cuts to a prefix and `…`. Dock rows and blanks may lie between; the scrollback, five cells in,
 * ends the search.
 */
export function waitsOnAnswers(rows: readonly ScreenRow[], top: number): boolean {
  for (let index = top - 1; index >= Math.max(0, top - 12); index -= 1) {
    const row = rows[index] as ScreenRow;
    const indent = rowIndent(row);
    if (indent === null) continue;
    if (indent >= 5) return false;
    const text = trimmedText(row);
    if (!text.startsWith('◆ ')) continue;
    const label = text.slice(2);
    if (label.startsWith(WAITING_LABEL)) return true;
    const cut = label.indexOf('…');
    if (cut >= 0) {
      const stem = trimmed(label.slice(0, cut));
      if ([...stem].length >= 'Waiting'.length && WAITING_LABEL.startsWith(stem)) return true;
    }
  }
  return false;
}
