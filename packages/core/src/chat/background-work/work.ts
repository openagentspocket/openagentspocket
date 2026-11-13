// The Background Work Chat lists above its Composer (Swift ChatBackgroundWork, ADR 0024): the
// transcript's Subagents and Workflows, each Workflow with its journal's progress, running work
// first. Built afresh after every read and never saved, so nothing read from the device can claim to
// be running.

import { listedBackgroundWork, runStartedAt } from '../model/transcript';
import type { ChatBackgroundWorkItem, ChatNotice, ChatTranscript } from '../model/types';
import type { ChatWorkflowProgress } from '../model/workflow-progress';
import { readsSubagentTranscripts } from '../programs/registry';

export interface BackgroundWorkRow {
  item: ChatBackgroundWorkItem;
  progress: ChatWorkflowProgress | null;
  /** Running, with no sign of it for longer than such work runs: the program may have stopped it. */
  isStale: boolean;
  /** The newest sign of the work, on the Host's clock: its launch or latest resume, or a Workflow's latest journal write. */
  lastActivity: string | null;
}

/** How long running work may show no sign of itself before its row stops claiming it runs (seconds). */
export interface BackgroundWorkStaleness {
  /** A Workflow's journal gains a line as each of its agents starts or ends. */
  workflowQuiet: number;
  /** A Subagent records nothing until it ends. */
  subagentRun: number;
}

export const DEFAULT_STALENESS: BackgroundWorkStaleness = {
  workflowQuiet: 2 * 3600,
  subagentRun: 3 * 3600,
};

export interface ChatBackgroundWork {
  rows: BackgroundWorkRow[];
  /** The rows come from a live read: the transcript is followed, not shown from the device, and the last read worked. */
  isLive: boolean;
}

export const emptyBackgroundWork = (): ChatBackgroundWork => ({ rows: [], isLive: false });

export const isRowRunning = (row: BackgroundWorkRow) => row.item.state === 'running';

const time = (iso: string | null) => (iso === null ? null : Date.parse(iso));

/** The newer of two ISO timestamps; null when neither reads. */
function newest(...stamps: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const stamp of stamps) {
    const parsed = time(stamp ?? null);
    if (parsed === null || Number.isNaN(parsed) || parsed <= bestTime) continue;
    best = stamp ?? null;
    bestTime = parsed;
  }
  return best;
}

export function backgroundWorkOf(
  transcript: ChatTranscript,
  progress: Readonly<Record<string, ChatWorkflowProgress>>,
  isLive: boolean,
  now: number,
  staleness: BackgroundWorkStaleness = DEFAULT_STALENESS,
): ChatBackgroundWork {
  const rows = listedBackgroundWork(transcript).map((item): BackgroundWorkRow => {
    const known = progress[item.id] ?? null;
    const lastActivity = newest(runStartedAt(item), known?.updatedAt);
    let isStale = false;
    if (item.state === 'running' && lastActivity !== null) {
      const limit = item.kind === 'workflow' ? staleness.workflowQuiet : staleness.subagentRun;
      isStale = (now - Date.parse(lastActivity)) / 1000 > limit;
    }
    return { item, progress: known, isStale, lastActivity };
  });
  // Running first; each part keeps launch order, so rows never jump.
  return {
    rows: [...rows.filter(isRowRunning), ...rows.filter((row) => !isRowRunning(row))],
    isLive,
  };
}

/** Whether a live read shows work running, which keeps Chat reading at its active pace. */
export const holdsActivePace = (work: ChatBackgroundWork): boolean =>
  work.isLive && work.rows.some((row) => isRowRunning(row) && !row.isStale);

/** A harness notice ("Background command ... completed"): no row of the conversation, listed in the sheet. */
export interface BackgroundWorkNotice {
  id: string;
  notice: ChatNotice;
}

/**
 * The harness notices since the user's latest message, oldest first: the records Chat's timeline
 * leaves out (its `isHarnessNotice`), which leave the sheet with the next message as finished work does.
 */
export function listedNotices(transcript: ChatTranscript): BackgroundWorkNotice[] {
  const prompt = transcript.latestPromptOffset ?? 0;
  return transcript.entries.flatMap((entry) =>
    entry.content.type === 'notice' &&
    entry.content.value.kind === 'taskNotification' &&
    entry.sourceOffset > prompt
      ? [{ id: entry.id, notice: entry.content.value }]
      : [],
  );
}

/**
 * The id a Subagent's transcript opens by, when its row may open one: the program reads
 * Subagent transcripts (`ProgramDefinition.readsSubagentTranscripts`) and the launch named the
 * Subagent. Null leaves the row with nothing to open.
 */
export function openableSubagentID(
  items: readonly ChatBackgroundWorkItem[],
  workID: string,
  program: string | null | undefined,
): string | null {
  if (!readsSubagentTranscripts(program)) return null;
  const item = items.find((candidate) => candidate.id === workID);
  return item?.kind === 'subagent' ? item.agentID : null;
}
