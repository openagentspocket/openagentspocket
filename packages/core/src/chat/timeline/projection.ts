// Folds the timeline's rows (Swift ChatTimelineProjection, ADR 0024). A finished turn keeps its
// prompt, the rows it pins and its final answer; everything between folds behind a "Worked for"
// header. Two or more consecutive tool calls show as one group header. Each header opens on its own,
// and opening a turn opens none of the groups or rows inside it. A pure function of the built rows.

import type { ChatTurn, ChatTurnEnd, ToolStatus, TurnEnding } from '../model/types';
import { holdsHead, isAwaiting, isBlank, isGroupable, isPinned, isReasoning } from './predicates';
import {
  type ChatRow,
  type ChatRowID,
  type ChatTurnHeader,
  type ChatTurnSignals,
  chatRow,
  entryOf,
  hashRevision,
  rowID,
  topSpacing,
} from './row';
import { coalescingSubagents } from './subagents';
import { summaryOfTools } from './summary';

/** One turn's disclosure scope, including rows hidden by a turn or tool-group header. */
export interface Trajectory {
  rowIDs: ReadonlySet<ChatRowID>;
  shownIDs: ChatRowID[];
  turnHeader: ChatRowID | null;
}

export function trajectoryContains(trajectory: Trajectory, id: ChatRowID): boolean {
  if (trajectory.rowIDs.has(id)) return true;
  const separator = id.indexOf(':');
  const prefix = separator < 0 ? '' : id.slice(0, separator);
  if (prefix === 'turn' || prefix === 'group' || prefix === 'liveGroup') {
    return trajectory.rowIDs.has(rowID.entry(id.slice(separator + 1)));
  }
  return false;
}

export interface ProjectionOutput {
  /** What the list shows, with spacing for its own neighbors. */
  rows: ChatRow[];
  /** Each folded row, by the shown header that holds it. */
  owners: Map<ChatRowID, ChatRowID>;
  trajectories: Trajectory[];
}

/** Whether the newest turn runs, waits on Background Work, or is done. */
export type TurnPhase = 'running' | 'held' | 'settled';

interface Segment {
  /** The prompt or notice that opened the turn. */
  head: ChatRow | null;
  body: ChatRow[];
  record: ChatTurn | null;
  /** How the turn opened above the loaded rows ended. */
  precedingEnd: ChatTurnEnd | null;
}

const segmentEnding = (segment: Segment): TurnEnding | null =>
  segment.record?.ending ?? segment.precedingEnd?.ending ?? null;

/** Wall time from the turn's start to its end, or what the record above the loaded rows says. */
function segmentDuration(segment: Segment): number | null {
  const start = segment.record?.startedAt;
  const end = segment.record?.endedAt;
  if (!start || !end) return segment.precedingEnd?.duration ?? null;
  return Math.max(0, (Date.parse(end) - Date.parse(start)) / 1000);
}

const FAILED: ReadonlySet<ToolStatus> = new Set([
  'failed',
  'declined',
  'interrupted',
  'notCompleted',
]);

/** The newest turn's phase, from how its records say it ended. */
export function newestPhase(ending: TurnEnding | null, signals: ChatTurnSignals): TurnPhase {
  // A turn its records closed is over: any new work is a turn the transcript does not show yet.
  // Without a live Host the rows are as last seen, and a clock counting from them would read as work.
  if (ending === null && signals.activity !== 'idle' && signals.isLive) return 'running';
  return signals.isBackgroundWorkRunning ? 'held' : 'settled';
}

/** A running call as last seen: it may have ended since, so it stops claiming to run. */
function lastSeen(row: ChatRow): ChatRow {
  const content = row.content;
  if (content.type !== 'tool' || content.tool.status !== 'running') return row;
  return {
    ...row,
    content: { type: 'tool', tool: { ...content.tool, isNotUpdating: true } },
    revision: hashRevision(row.revision, true),
  };
}

const headerRevision = (header: ChatTurnHeader) => hashRevision(JSON.stringify(header));

export interface ProjectionInput {
  turns: readonly ChatTurn[];
  precedingTurnEnd?: ChatTurnEnd | null;
  signals: ChatTurnSignals;
  open?: ReadonlySet<ChatRowID>;
}

export function projectTimeline(
  rows: readonly ChatRow[],
  { turns, precedingTurnEnd = null, signals, open = new Set() }: ProjectionInput,
): ProjectionOutput {
  const output: ProjectionOutput = { rows: [], owners: new Map(), trajectories: [] };
  const segments: Segment[] = [];
  const pending: ChatRow[] = [];
  let hasOlder = false;
  const records = new Map<ChatRowID, ChatTurn>();
  for (const turn of turns) records.set(rowID.entry(turn.firstEntryID), turn);

  for (const row of signals.isLive ? rows : rows.map(lastSeen)) {
    const content = row.content;
    if (content.type === 'olderHistory') {
      hasOlder = content.older !== 'reachedStart';
      output.rows.push(row);
      continue;
    }
    const record = records.get(row.id);
    // A message sent from Chat opens no turn of its own: one the program holds, or that never
    // arrived, would otherwise settle the turn still running above it. It follows every turn.
    if (content.type === 'pending') {
      pending.push(row);
    } else if (record) {
      const head = holdsHead(row);
      segments.push({
        head: head ? row : null,
        body: head ? [] : [row],
        record,
        precedingEnd: null,
      });
    } else if (turns.length === 0 && content.type === 'user' && !content.message.wasQueued) {
      // Without the program's turns, a prompt opens one.
      segments.push({ head: row, body: [], record: null, precedingEnd: null });
    } else if (segments.length === 0) {
      // Rows above the first loaded opener belong to a turn whose start is further up. The end the
      // loaded lines record for it counts once earlier messages wait for the user.
      segments.push({
        head: null,
        body: [row],
        record: null,
        precedingEnd: signals.olderAwaitsUser ? precedingTurnEnd : null,
      });
    } else {
      segments[segments.length - 1]?.body.push(row);
    }
  }

  segments.forEach((segment, index) => {
    const phase =
      index === segments.length - 1 ? newestPhase(segmentEnding(segment), signals) : 'settled';
    // Rows of a turn whose start is still to load show as they arrive: folded, each page would add
    // nothing to see. Once earlier messages wait for the user, the turn reads as finished.
    const isPartial =
      index === 0 &&
      segment.head === null &&
      segment.record === null &&
      hasOlder &&
      !signals.olderAwaitsUser;
    const first = output.rows.length;
    emit(segment, phase, !isPartial, signals, open, output);
    const shown = output.rows.slice(first);
    const members = new Set(segment.body.map((row) => row.id));
    if (segment.head) members.add(segment.head.id);
    for (const row of shown) members.add(row.id);
    const header = shown.find(
      (row) => row.content.type === 'turnHeader' && row.content.header.state.kind === 'worked',
    );
    output.trajectories.push({
      rowIDs: members,
      shownIDs: shown.map((row) => row.id),
      turnHeader: header?.id ?? null,
    });
  });

  output.rows.push(...pending);
  output.rows = output.rows.map((row, index) => ({
    ...row,
    topSpacing: topSpacing(
      row.content,
      index > 0 ? (output.rows[index - 1]?.content ?? null) : null,
    ),
  }));
  return output;
}

function emit(
  segment: Segment,
  phase: TurnPhase,
  folds: boolean,
  signals: ChatTurnSignals,
  open: ReadonlySet<ChatRowID>,
  output: ProjectionOutput,
): void {
  if (segment.head) output.rows.push(segment.head);
  // Reasoning with no text says nothing, wherever it is.
  const body = coalescingSubagents(segment.body, output.owners).filter((row) => !isBlank(row));

  const fold =
    phase === 'settled' && folds && signals.foldsFinishedTurns
      ? foldOf(body, segmentEnding(segment))
      : null;
  if (fold) {
    const steps = body.slice(0, fold.answerStart);
    for (const row of steps) if (isPinned(row)) output.rows.push(row);
    const folded = steps.filter((row) => !isPinned(row));
    const id = rowID.turn(fold.answerID);
    const isOpen = open.has(id);
    const header: ChatTurnHeader = {
      state: { kind: 'worked', seconds: segmentDuration(segment) },
      isOpen,
      stepCount: folded.length,
    };
    output.rows.push(chatRow(id, { type: 'turnHeader', header }, headerRevision(header)));
    if (isOpen) {
      // The pinned rows, shown above, still end the runs they cut.
      emitGrouped(steps, isPinned, false, true, open, output);
    } else {
      for (const row of folded) output.owners.set(row.id, id);
    }
    output.rows.push(...body.slice(fold.answerStart));
    return;
  }

  const startedAt = segment.record?.startedAt;
  if (phase === 'running' && startedAt) {
    const header: ChatTurnHeader = {
      state: { kind: 'working', since: startedAt },
      isOpen: false,
      stepCount: 0,
    };
    output.rows.push(
      chatRow(rowID.liveTurn, { type: 'turnHeader', header }, headerRevision(header)),
    );
  }
  emitGrouped(body, () => false, phase === 'running', false, open, output);
}

/**
 * Where a finished turn's final answer starts: the model's text at its end, past the rows it pins.
 * Null when there is none, when nothing comes before it, or when the turn was interrupted or failed.
 */
function foldOf(
  body: readonly ChatRow[],
  ending: TurnEnding | null,
): { answerStart: number; answerID: string } | null {
  if (ending === 'interrupted' || ending === 'failed') return null;
  let end = body.length;
  while (end > 0 && isPinned(body[end - 1] as ChatRow)) end -= 1;
  let start = end;
  while (start > 0 && body[start - 1]?.content.type === 'assistant') start -= 1;
  if (start >= end) return null;
  const answerID = entryOf((body[start] as ChatRow).id);
  if (answerID === null || !body.slice(0, start).some((row) => !isPinned(row))) return null;
  return { answerStart: start, answerID };
}

/**
 * Emits `rows` with each run of two or more tool calls behind a group header. In a running turn the
 * last run, while nothing but reasoning follows it, keeps its newest call as its own row. Rows `skip`
 * takes are shown elsewhere: they end runs and are not emitted here.
 */
function emitGrouped(
  rows: readonly ChatRow[],
  skip: (row: ChatRow) => boolean,
  isLive: boolean,
  isMuted: boolean,
  open: ReadonlySet<ChatRowID>,
  output: ProjectionOutput,
): void {
  const plain = (row: ChatRow): ChatRow =>
    row.content.type === 'assistant' || row.content.type === 'reasoning'
      ? { ...row, isMuted }
      : row;
  let index = 0;
  while (index < rows.length) {
    const current = rows[index] as ChatRow;
    if (!isGroupable(current)) {
      if (!skip(current)) output.rows.push(plain(current));
      index += 1;
      continue;
    }
    // Reasoning between calls joins their run; reasoning after the last call stays outside it.
    let cursor = index;
    let last = index;
    while (cursor < rows.length) {
      const row = rows[cursor] as ChatRow;
      if (!isGroupable(row) && !isReasoning(row)) break;
      if (isGroupable(row)) last = cursor;
      cursor += 1;
    }
    const run = rows.slice(index, last + 1);
    const calls = run.filter(isGroupable).length;
    // A call waiting on the user is the run's newest while it waits, so the group keeps its
    // identity through the dialog.
    const tail = rows.slice(last + 1);
    const isLiveRun = isLive && tail.every((row) => isReasoning(row) || isAwaiting(row));
    const firstID = entryOf((run[0] as ChatRow).id);
    const lastID = entryOf((run[run.length - 1] as ChatRow).id);
    if (calls < 2) {
      output.rows.push(...run.map(plain));
    } else if (isLiveRun && tail.some(isAwaiting) && firstID !== null) {
      emitGroup(run, rowID.liveGroup(firstID), open, plain, output);
    } else if (isLiveRun) {
      const members = run.slice(0, -1);
      const memberFirst = entryOf((members[0] as ChatRow).id);
      if (memberFirst !== null)
        emitGroup(members, rowID.liveGroup(memberFirst), open, plain, output);
      output.rows.push(plain(run[run.length - 1] as ChatRow));
    } else if (lastID !== null) {
      emitGroup(run, rowID.group(lastID), open, plain, output);
    }
    index = last + 1;
  }
}

function emitGroup(
  members: readonly ChatRow[],
  id: ChatRowID,
  open: ReadonlySet<ChatRowID>,
  plain: (row: ChatRow) => ChatRow,
  output: ProjectionOutput,
): void {
  const tools = members.flatMap((row) => (row.content.type === 'tool' ? [row.content.tool] : []));
  const isOpen = open.has(id);
  const diffs = tools.flatMap((tool) => (tool.diff ? [tool.diff] : []));
  const group = {
    summary: summaryOfTools(tools),
    kind: tools[0]?.kind ?? 'other',
    added: diffs.length === 0 ? null : diffs.reduce((sum, diff) => sum + diff.added, 0),
    removed: diffs.length === 0 ? null : diffs.reduce((sum, diff) => sum + diff.removed, 0),
    failed: tools.filter((tool) => FAILED.has(tool.status)).length,
    isRunning: tools.some((tool) => tool.status === 'running' && !tool.isNotUpdating),
    calls: tools.length,
    isOpen,
  } as const;
  const revision = hashRevision(JSON.stringify(group), ...members.map((row) => row.revision));
  output.rows.push(chatRow(id, { type: 'toolGroup', group }, revision));
  if (isOpen) {
    for (const member of members) output.rows.push({ ...plain(member), isNested: true });
  } else {
    for (const member of members) output.owners.set(member.id, id);
  }
}
