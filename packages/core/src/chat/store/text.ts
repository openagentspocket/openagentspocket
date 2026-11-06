// Text a store's row may hold cut: the projections of its programs show it alike.

import { markdownPlainText } from '../model/markdown-plain';
import { capPreview } from '../model/preview';

export const trimmed = (text: string) => text.trim();
export const scalarCount = (text: string) => Array.from(text).length;
/** Whether the source cut `text`: `length` counts what the store holds, in characters as SQLite counts them. */
export const isCut = (text: string, length: number | null) => (length ?? 0) > scalarCount(text);
export const shown = (text: string, cut: boolean) =>
  cut ? `${text}\n\n(truncated in Chat)` : text;

/** A compaction divider's preview: the summary's Markdown as plain lines, capped like a row's output. */
export function compactionPreview(summary: string | null): string | null {
  if (summary === null) return null;
  const preview = capPreview(markdownPlainText(summary)).text;
  return preview === '' ? null : preview;
}
