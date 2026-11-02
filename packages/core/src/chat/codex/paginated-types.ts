// Types and helpers of the paginated builder (Swift CodexPaginatedBuilder).

import type { CodexRecord, CodexStoredLine, CodexToolSnapshot } from './record';
import type { CodexSegment } from './segment';
import type { CodexQuestionBuild, CodexTimelineEntry, CodexTurnStatus } from './timeline';
import { type CodexTimeline, type CodexTimelineTurn, questionState } from './timeline';

export interface CodexOrdinalDiagnostics {
  /** Accepted lines without an ordinal. */
  missing: number;
  /** Lines whose ordinal was already taken: the first line wins. */
  duplicates: number;
  /** Places where ordinals skip ahead. */
  gaps: number;
  /** Lines before `subagent_history_start_ordinal`: history inherited from the parent. */
  inherited: number;
}

export function emptyOrdinals(): CodexOrdinalDiagnostics {
  return { missing: 0, duplicates: 0, gaps: 0, inherited: 0 };
}

/** Orders lines across segments: older segments first, then file order. */
export interface Position {
  segment: number;
  offset: number;
}

export function before(a: Position, b: Position): number {
  return a.segment !== b.segment ? a.segment - b.segment : a.offset - b.offset;
}

export interface Item {
  position: Position;
  entry: CodexTimelineEntry;
  /** Set for a sync question row, whose content is built at the end. */
  question: CodexQuestionBuild | null;
  /** A row derived from an aborted code-mode patch. */
  isCodeModePatch: boolean;
  /** A tool call first recorded after its turn completed. */
  isLate: boolean;
}

export interface PendingPatch {
  turnID: string;
  position: Position;
  line: CodexStoredLine;
  segment: CodexSegment;
  snapshot: CodexToolSnapshot;
}

export interface Turn {
  id: string;
  position: Position;
  status: CodexTurnStatus | null;
  /** The segment whose line set `status`. */
  statusSegment: number;
  ending: CodexTimelineEntry | null;
  items: Map<string, Item>;
  startedAt: string | null;
  endedAt: string | null;
  sawStart: boolean;
}

export type Accepted = { record: CodexRecord; line: CodexStoredLine };

export function turnIDNamed(record: CodexRecord): string | null {
  switch (record.type) {
    case 'turnStarted':
    case 'turnCompleted':
    case 'item':
      return record.turnID;
    case 'turnAborted':
      return record.turnID;
    default:
      return null;
  }
}

export function placingLateItems(items: [string, Item][]): [string, Item][] {
  const late = items.filter(([, item]) => item.isLate);
  if (late.length === 0) return items;
  const placed = items.filter(([, item]) => !item.isLate);
  let answerStart = placed.length;
  while (answerStart > 0) {
    const content = (placed[answerStart - 1] as [string, Item])[1].entry.content;
    if (content.type === 'item' && content.value.type === 'agent') answerStart -= 1;
    else break;
  }
  placed.splice(answerStart, 0, ...late);
  return placed;
}

/** The files a patch row names, as a canonical key, so a different order still matches. */
export function patchFiles(item: Item): string | null {
  const content = item.entry.content;
  if (content.type !== 'item' || content.value.type !== 'tool') return null;
  return JSON.stringify([...new Set(content.value.value.title.split(', '))].sort());
}

export function recordedPatchFiles(turn: Turn): Set<string> {
  const files = new Set<string>();
  for (const item of turn.items.values()) {
    const content = item.entry.content;
    if (
      content.type === 'item' &&
      content.value.type === 'tool' &&
      content.value.value.name === 'FileChange'
    ) {
      const key = patchFiles(item);
      if (key !== null) files.add(key);
    }
  }
  return files;
}

/** The timeline of `segments`, oldest first, each already cut to the range it contributes. */

/** The turns in file order with their items placed, question rows built and patch twins dropped. */
export function assembleTimeline(turns: Map<string, Turn>): CodexTimeline {
  const ordered = [...turns.values()].sort((a, b) => before(a.position, b.position));
  return {
    leading: [],
    turns: ordered.map((turn): CodexTimelineTurn => {
      const recorded = recordedPatchFiles(turn);
      const items = placingLateItems(
        [...turn.items.entries()]
          .filter(([, item]) => {
            if (!item.isCodeModePatch) return true;
            const files = patchFiles(item);
            return files === null || !recorded.has(files);
          })
          .sort((a, b) => before(a[1].position, b[1].position)),
      );
      return {
        id: turn.id,
        status: turn.status,
        entries: items.map(([key, item]) => {
          const entry = item.entry;
          return item.question
            ? {
                ...entry,
                content: { type: 'question', value: questionState(item.question, key) },
              }
            : entry;
        }),
        ending: turn.ending,
        startedAt: turn.startedAt,
        endedAt: turn.endedAt,
        opensInWindow: turn.sawStart,
      };
    }),
  };
}
