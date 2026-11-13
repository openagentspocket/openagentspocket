import { message, type Text } from '../errors/text';

/** How much of a diff line a comment quotes; a longer line ends with an ellipsis. */
export const LINE_QUOTE_LIMIT = 120;

/** The diff line a comment points at. */
export interface CommentedLine {
  /** The file's path in the Checkout (the old path for a removed line of a rename). */
  readonly path: string;
  /** The new number for added and unchanged lines; the old one for a removed line. */
  readonly number: number;
  readonly removed: boolean;
  /** The line as the diff shows it. */
  readonly text: string;
}

/**
 * One line, whatever was typed: a line break reaches a terminal Agent as Enter (the Composer's
 * delivery types the text with `tmux send-keys -l`, unframed), so a comment never carries one.
 */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The quoted line, on one line and capped at `LINE_QUOTE_LIMIT` characters. */
export function quotedLine(text: string): string {
  const line = oneLine(text);
  const chars = Array.from(line);
  return chars.length > LINE_QUOTE_LIMIT ? `${chars.slice(0, LINE_QUOTE_LIMIT).join('')}…` : line;
}

/**
 * A review comment on one diff line, for the Agent's Composer: where (file, line, removed or not),
 * what the line says, and the user's words. Plain language for every program. Blank comment: null.
 */
export function lineCommentText(line: CommentedLine, comment: string): Text | null {
  const words = oneLine(comment);
  if (words === '') return null;
  const quote = quotedLine(line.text);
  const number = String(line.number);
  if (quote === '') {
    return line.removed
      ? message('In %@, removed line %@: %@', line.path, number, words)
      : message('In %@, line %@: %@', line.path, number, words);
  }
  return line.removed
    ? message('In %@, removed line %@ (`%@`): %@', line.path, number, quote, words)
    : message('In %@, line %@ (`%@`): %@', line.path, number, quote, words);
}
