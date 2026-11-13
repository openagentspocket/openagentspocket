// The Agent's latest answer: the message the actions under it (Copy) act on.

import type { ChatRow, ChatRowID } from './row';

export interface ChatLatestAnswer {
  /** The answer's last row, which the actions sit under. */
  id: ChatRowID;
  /** The whole answer: its consecutive messages, joined. */
  text: string;
}

const answerText = (row: ChatRow | undefined): string | null =>
  row !== undefined && row.content.type === 'assistant' && !row.isMuted && !row.isNested
    ? row.content.source
    : null;

/**
 * The newest answer the Agent finished: the last run of its messages, above the running turn's
 * header when one runs (what the running turn writes is not an answer yet). Null when there is none.
 */
export function latestAnswer(rows: readonly ChatRow[]): ChatLatestAnswer | null {
  const live = rows.findIndex((row) => row.id === 'liveTurn');
  let end = (live < 0 ? rows.length : live) - 1;
  while (end >= 0 && answerText(rows[end]) === null) end -= 1;
  if (end < 0) return null;
  const parts: string[] = [];
  for (let index = end; index >= 0; index -= 1) {
    const text = answerText(rows[index]);
    if (text === null) break;
    parts.unshift(text);
  }
  return { id: (rows[end] as ChatRow).id, text: parts.join('\n\n') };
}
