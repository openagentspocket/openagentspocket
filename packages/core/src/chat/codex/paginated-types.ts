// Types and helpers of the paginated builder (Swift CodexPaginatedBuilder).

import type { CodexCallOutput, CodexRecord, CodexStoredLine, CodexToolSnapshot } from './record';
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
  /**
   * A row derived from a code-mode call (an aborted patch, or a command): the command lines it
   * runs, empty for a patch. Its recorded twin (FileChange, CommandExecution) stands for it.
   */
  codeModeCommands: readonly string[] | null;
  /** A tool call first recorded after its turn completed. */
  isLate: boolean;
}

export interface PendingCodeModeCall {
  turnID: string;
  position: Position;
  line: CodexStoredLine;
  segment: CodexSegment;
  snapshot: CodexToolSnapshot;
  /** The command lines a command call runs; null for a patch. */
  commands: string[] | null;
}

/**
 * What a code-mode call's output says of its row. Aborted: a patch was not applied (stopped), a
 * command never ran (declined on Codex's card, or stopped before it was approved: a command that
 * ran has a CommandExecution twin). Otherwise the script's status, exit code and output, read
 * again from the output's line when the row opens.
 */
export function codeModeOutcome(
  call: PendingCodeModeCall,
  output: CodexCallOutput,
): Partial<CodexToolSnapshot> {
  if (output.isAbortedByUser)
    return { status: call.commands === null ? 'interrupted' : 'declined' };
  return {
    status: output.scriptStatus,
    exitCode: output.exitCode,
    preview: output.preview,
    output: output.output,
  };
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

function commandExecutionTitle(item: Item): string | null {
  const content = item.entry.content;
  return content.type === 'item' &&
    content.value.type === 'tool' &&
    content.value.value.name === 'CommandExecution'
    ? content.value.value.title.trim()
    : null;
}

/**
 * The code-mode command rows a recorded CommandExecution stands for: each run is paired with the
 * latest earlier row still waiting for that command line, and a row goes once all its lines ran.
 * A row whose command never ran (declined, refused by the sandbox before running) keeps its place.
 */
function commandTwins(sorted: readonly Item[]): Set<Item> {
  const waiting: { item: Item; lines: string[] }[] = [];
  const twins = new Set<Item>();
  for (const item of sorted) {
    const lines = item.codeModeCommands;
    if (lines && lines.length > 0) {
      waiting.push({ item, lines: lines.map((line) => line.trim()) });
      continue;
    }
    const ran = commandExecutionTitle(item);
    if (ran === null) continue;
    for (let index = waiting.length - 1; index >= 0; index -= 1) {
      const row = waiting[index] as { item: Item; lines: string[] };
      const at = row.lines.indexOf(ran);
      if (at < 0) continue;
      row.lines.splice(at, 1);
      if (row.lines.length === 0) {
        twins.add(row.item);
        waiting.splice(index, 1);
      }
      break;
    }
  }
  return twins;
}

/** An aborted code-mode patch row whose FileChange twin stands for it. */
function isPatchTwin(item: Item, files: Set<string>): boolean {
  if (item.codeModeCommands === null || item.codeModeCommands.length > 0) return false;
  const key = patchFiles(item);
  return key !== null && files.has(key);
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

/** The turns in file order with their items placed, question rows built and code-mode twins dropped. */
export function assembleTimeline(turns: Map<string, Turn>): CodexTimeline {
  const ordered = [...turns.values()].sort((a, b) => before(a.position, b.position));
  return {
    leading: [],
    turns: ordered.map((turn): CodexTimelineTurn => {
      const files = recordedPatchFiles(turn);
      const sorted = [...turn.items.entries()].sort((a, b) => before(a[1].position, b[1].position));
      const twins = commandTwins(sorted.map(([, item]) => item));
      const items = placingLateItems(
        sorted.filter(([, item]) => !twins.has(item) && !isPatchTwin(item, files)),
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
