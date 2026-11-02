import {
  agentDisplayName,
  agentKindLabel,
  agentTerminalTitleStripped,
  agentTitle,
} from './agent-fields';
import { type ConsoleRow, displayPath, rowDirectory, rowKey } from './row';
import { observing, type StatusStamp } from './status-stamp';

export type StatusInboxSection = 'needsYou' | 'working' | 'doneRecent' | 'idle';

export const STATUS_INBOX_SECTIONS: readonly StatusInboxSection[] = [
  'needsYou',
  'working',
  'doneRecent',
  'idle',
];

export interface StatusInboxChip {
  readonly kind: 'host' | 'folder' | 'model';
  readonly text: string;
}

export interface StatusInboxItem {
  readonly key: string;
  readonly row: ConsoleRow;
  readonly section: StatusInboxSection;
  readonly title: string;
  readonly titleQualifier?: string;
  readonly detail?: string;
  readonly chips: readonly StatusInboxChip[];
  readonly since?: number;
  readonly isApproximate: boolean;
  readonly isPinned: boolean;
}

/** An Idle that just left Working stays Working this long, so a flapping status does not flicker. */
export const WORKING_HYSTERESIS_MS = 3000;
/** How long after work ends an Agent still counts as Recent. */
export const DEFAULT_RECENT_WINDOW_MS = 6 * 60 * 60 * 1000;

export interface StatusInboxInput {
  readonly rows: readonly ConsoleRow[];
  readonly stamps: (key: string) => StatusStamp | undefined;
  readonly pinRank: (row: ConsoleRow) => number | undefined;
  readonly lastMessage: (key: string) => string | undefined;
  /** Saved Chats listed with the Agents: always Idle. */
  readonly savedKeys: ReadonlySet<string>;
  readonly now: number;
  readonly recentWindowMs?: number;
}

/** The section an Agent belongs in. Unrecognized statuses are Idle. */
export function sectionFor(
  status: string,
  stamp: StatusStamp | undefined,
  now: number,
  recentWindowMs: number,
): StatusInboxSection {
  switch (status) {
    case 'blocked':
      return 'needsYou';
    case 'working':
      return 'working';
    case 'done':
      return stamp?.dismissed ? 'idle' : 'doneRecent';
    case 'idle': {
      if (!stamp) return 'idle';
      if (stamp.previousStatus === 'working' && now - stamp.since < WORKING_HYSTERESIS_MS) {
        return 'working';
      }
      if (
        !stamp.dismissed &&
        stamp.lastWorkEndedAt !== undefined &&
        now - stamp.lastWorkEndedAt <= recentWindowMs
      ) {
        return 'doneRecent';
      }
      return 'idle';
    }
    default:
      return 'idle';
  }
}

/** The title shown: stripped terminal title, legacy title, pane title, else the Agent's name. */
export function inboxTitle(row: ConsoleRow): string {
  const agent = row.agent;
  for (const candidate of [agentTerminalTitleStripped(agent), agentTitle(agent), agent.title]) {
    const trimmed = candidate?.trim() ?? '';
    if (trimmed !== '') return trimmed;
  }
  return agentDisplayName(agent);
}

/** The last path component of the Agent's directory, or `~` for the Host user's home. */
export function inboxFolder(row: ConsoleRow): string | undefined {
  const directory = rowDirectory(row);
  if (directory === undefined) return undefined;
  const shown = displayPath(row, directory);
  if (shown === '~') return shown;
  return shown
    .split('/')
    .filter((part) => part !== '')
    .at(-1);
}

export function inboxChips(row: ConsoleRow): StatusInboxChip[] {
  const chips: StatusInboxChip[] = [{ kind: 'host', text: row.hostName }];
  const folder = inboxFolder(row);
  if (folder !== undefined) chips.push({ kind: 'folder', text: folder });
  const model = row.agent.tokens?.model?.trim();
  if (model) chips.push({ kind: 'model', text: model });
  return chips.filter((chip) => chip.text !== '');
}

/**
 * The program name that follows a title when another Agent shows the same one: only titles that
 * collide get one, and only when the program actually separates them.
 */
export function titleQualifiers(
  entries: readonly { key: string; title: string; kind: string; namesAgent: boolean }[],
): Map<string, string> {
  const programsByTitle = new Map<string, Set<string>>();
  for (const entry of entries) {
    const programs = programsByTitle.get(entry.title) ?? new Set<string>();
    programs.add(agentKindLabel(entry.kind));
    programsByTitle.set(entry.title, programs);
  }
  const out = new Map<string, string>();
  for (const entry of entries) {
    if (entry.namesAgent) continue;
    if ((programsByTitle.get(entry.title)?.size ?? 0) > 1)
      out.set(entry.key, agentKindLabel(entry.kind));
  }
  return out;
}

function detailFor(
  row: ConsoleRow,
  section: StatusInboxSection,
  lastMessage: (key: string) => string | undefined,
): string | undefined {
  const text =
    section === 'needsYou'
      ? row.lastOutputSnippet
      : section === 'doneRecent'
        ? lastMessage(rowKey(row))
        : undefined;
  const trimmed = text?.trim() ?? '';
  return trimmed === '' ? undefined : trimmed;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function precedes(a: { item: StatusInboxItem; rank?: number }, b: typeof a): number {
  if (a.rank !== undefined || b.rank !== undefined) {
    if (a.rank === undefined) return 1;
    if (b.rank === undefined) return -1;
    if (a.rank !== b.rank) return a.rank - b.rank;
  }
  const left = a.item;
  const right = b.item;
  if (left.section !== 'idle') {
    if (left.since !== undefined && right.since !== undefined) {
      if (left.since !== right.since) {
        // Needs you: waiting longest first. Others: newest first.
        return left.section === 'needsYou' ? left.since - right.since : right.since - left.since;
      }
    } else if (left.since !== undefined) {
      return -1;
    } else if (right.since !== undefined) {
      return 1;
    }
  }
  return (
    compareText(left.row.hostName, right.row.hostName) ||
    compareText(left.row.hostId, right.row.hostId) ||
    compareText(left.row.workspaceLabel ?? '', right.row.workspaceLabel ?? '') ||
    compareText(left.row.agent.pane_id, right.row.agent.pane_id)
  );
}

/** Groups the Console's rows into Status Inbox sections; empty sections are omitted. */
export function statusInboxItems(
  input: StatusInboxInput,
): Partial<Record<StatusInboxSection, StatusInboxItem[]>> {
  const { now } = input;
  const recentWindowMs = input.recentWindowMs ?? DEFAULT_RECENT_WINDOW_MS;
  const titles = new Map(input.rows.map((row) => [rowKey(row), inboxTitle(row)]));
  const qualifiers = titleQualifiers(
    input.rows.map((row) => ({
      key: rowKey(row),
      title: titles.get(rowKey(row)) ?? '',
      kind: row.agent.agent ?? 'unknown',
      namesAgent: false,
    })),
  );
  const grouped = new Map<StatusInboxSection, { item: StatusInboxItem; rank?: number }[]>();
  for (const row of input.rows) {
    const key = rowKey(row);
    // The clock store catches up a turn later; until then advance its stamp here as it will.
    const current = input.stamps(key);
    const stamp = current ? observing(current, row.agent, now) : undefined;
    const section = input.savedKeys.has(key)
      ? 'idle'
      : sectionFor(row.agent.agent_status, stamp, now, recentWindowMs);
    const rank = input.pinRank(row);
    const item: StatusInboxItem = {
      key,
      row,
      section,
      title: titles.get(key) ?? agentDisplayName(row.agent),
      titleQualifier: qualifiers.get(key),
      detail: detailFor(row, section, input.lastMessage),
      chips: inboxChips(row),
      since: stamp?.since,
      isApproximate: stamp?.isApproximate ?? true,
      isPinned: rank !== undefined,
    };
    const list = grouped.get(section) ?? [];
    list.push({ item, rank });
    grouped.set(section, list);
  }
  const out: Partial<Record<StatusInboxSection, StatusInboxItem[]>> = {};
  for (const [section, entries] of grouped) {
    out[section] = [...entries].sort(precedes).map((entry) => entry.item);
  }
  return out;
}

/**
 * When the inbox next changes by itself (a hysteresis ends, a Recent window closes), so a view
 * can schedule one re-render instead of ticking. Undefined when nothing is pending.
 */
export function nextTransition(
  rows: readonly ConsoleRow[],
  stamps: (key: string) => StatusStamp | undefined,
  now: number,
  recentWindowMs: number = DEFAULT_RECENT_WINDOW_MS,
): number | undefined {
  let next: number | undefined;
  for (const row of rows) {
    if (row.agent.agent_status !== 'idle') continue;
    const current = stamps(rowKey(row));
    if (!current) continue;
    const stamp = observing(current, row.agent, now);
    const candidates: number[] = [];
    if (stamp.previousStatus === 'working') candidates.push(stamp.since + WORKING_HYSTERESIS_MS);
    // The window is inclusive: the item leaves just after it.
    if (!stamp.dismissed && stamp.lastWorkEndedAt !== undefined) {
      candidates.push(stamp.lastWorkEndedAt + recentWindowMs + 1000);
    }
    for (const candidate of candidates) {
      if (candidate > now) next = next === undefined ? candidate : Math.min(next, candidate);
    }
  }
  return next;
}
