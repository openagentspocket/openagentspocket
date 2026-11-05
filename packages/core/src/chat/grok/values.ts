// Small readers shared by the Grok record decoders (Swift GrokUpdateRecord statics).

import { capPreview } from '../model/preview';
import type { ChatToolPreview } from '../model/types';

/** A whole number, which JSON decodes as a double. */
export function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

/**
 * `text` capped like a row's output, without the line breaks that end it: a command's output ends
 * with its last line's, and a cap can fall right after a line's, either of which the row would show
 * as an empty line. Null when nothing is left to show.
 */
export function previewOf(text: string | null, imageCount = 0): ChatToolPreview | null {
  const trimmed = text === null ? null : withoutTrailingLineBreaks(text);
  if (trimmed === null || (trimmed === '' && imageCount === 0)) return null;
  const preview = capPreview(trimmed, imageCount);
  return { ...preview, text: withoutTrailingLineBreaks(preview.text) };
}

/** The text without the `\n` and `\r` that end it. */
export function withoutTrailingLineBreaks(text: string): string {
  return text.replace(/[\r\n]+$/, '');
}

/** A todo list as rows show it, one `[x]`, `[~]` or `[ ]` line per item. */
export function todoText(todos: readonly { content: string; status: string | null }[]): string {
  return todos
    .map((todo) =>
      todo.status === 'completed'
        ? `[x] ${todo.content}`
        : todo.status === 'in_progress'
          ? `[~] ${todo.content}`
          : `[ ] ${todo.content}`,
    )
    .join('\n');
}
