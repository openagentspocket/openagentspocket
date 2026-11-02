// Turns entries into timeline rows (Swift ChatRowBuilder, minus Markdown parsing which the UI owns).
// Each row keeps what it was built from: an unchanged entry keeps its row and revision. Revisions
// come from one counter, so a row that leaves and comes back can never match a height measured for
// its earlier content.

import type { ChatEntry, ChatEntryContent } from '../model/types';
import {
  type ChatOlderHistory,
  type ChatPendingEcho,
  type ChatRow,
  type ChatRowContent,
  type ChatRowID,
  chatRow,
  rowID,
  topSpacing,
} from './row';

export interface ChatTimelineInput {
  entries: readonly ChatEntry[];
  pending: readonly ChatPendingEcho[];
  older: ChatOlderHistory;
}

type Source =
  | { kind: 'entry'; content: ChatEntryContent }
  | { kind: 'pending'; echo: ChatPendingEcho }
  | { kind: 'older'; older: ChatOlderHistory };

interface Memo {
  key: string;
  spacing: number;
  revision: number;
}

function contentOf(source: Source): ChatRowContent {
  switch (source.kind) {
    case 'pending':
      return { type: 'pending', echo: source.echo };
    case 'older':
      return { type: 'olderHistory', older: source.older };
    case 'entry': {
      const content = source.content;
      switch (content.type) {
        case 'user':
          return { type: 'user', message: content.value };
        case 'assistant':
          return { type: 'assistant', source: content.value.text };
        case 'reasoning':
          return { type: 'reasoning', reasoning: content.value };
        case 'tool':
          return { type: 'tool', tool: content.value };
        case 'plan':
          return { type: 'plan', plan: content.value };
        case 'questions':
          return { type: 'questions', questions: content.value.questions };
        case 'notice':
          return { type: 'notice', notice: content.value };
        case 'divider':
          return { type: 'divider', divider: content.value };
      }
    }
  }
}

export class ChatRowBuilder {
  private memos = new Map<ChatRowID, Memo>();
  private lastRevision = 0;

  rows(input: ChatTimelineInput): ChatRow[] {
    const rows: ChatRow[] = [];
    const next = new Map<ChatRowID, Memo>();
    const append = (id: ChatRowID, source: Source) => {
      // A list keyed by id cannot hold a repeat, so a repeat is dropped.
      if (next.has(id)) return;
      const content = contentOf(source);
      const spacing = topSpacing(content, rows.at(-1)?.content ?? null);
      const key = JSON.stringify(source);
      const old = this.memos.get(id);
      const memo =
        old && old.key === key && old.spacing === spacing
          ? old
          : { key, spacing, revision: ++this.lastRevision };
      next.set(id, memo);
      rows.push(chatRow(id, content, memo.revision, spacing));
    };

    if (input.older !== 'reachedStart') {
      append(rowID.olderHistory, { kind: 'older', older: input.older });
    }
    for (const entry of input.entries) {
      append(rowID.entry(entry.id), { kind: 'entry', content: entry.content });
    }
    for (const echo of input.pending) {
      append(rowID.pending(echo.id), { kind: 'pending', echo });
    }
    this.memos = next;
    return rows;
  }

  /** Forgets every row, as when the conversation changes. */
  reset(): void {
    this.memos.clear();
  }
}
