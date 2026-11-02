import { agentDisplayName, agentTerminalTitleStripped, agentTitle } from './agent-fields';
import type { ConsoleRow } from './row';
import {
  STATUS_INBOX_SECTIONS,
  type StatusInboxItem,
  type StatusInboxSection,
} from './status-inbox';

/** How the Agents list groups its rows. Flat is the default. */
export type ListPresentation = 'flat' | 'byHost' | 'byWorkspace' | 'byStatus';

export const LIST_PRESENTATIONS: readonly ListPresentation[] = [
  'flat',
  'byHost',
  'byWorkspace',
  'byStatus',
];

/** One section of the list. `flat` is a single group with no header. */
export interface ListGroup {
  /** Stable across renames and reconnects (Workspace ids repeat between Hosts). */
  readonly id: string;
  readonly kind: 'flat' | 'host' | 'workspace' | 'status';
  /** Absent when nothing names the group (a Workspace without a label). */
  readonly title?: string;
  readonly hostId?: string;
  readonly section?: StatusInboxSection;
  readonly rows: readonly ConsoleRow[];
}

export interface HostName {
  readonly id: string;
  readonly name: string;
}

/** Keeps only the chosen Host's rows; no Host keeps all. */
export function filterByHost(rows: readonly ConsoleRow[], hostId?: string): readonly ConsoleRow[] {
  return hostId === undefined ? rows : rows.filter((row) => row.hostId === hostId);
}

function contains(field: string | null | undefined, needle: string): boolean {
  return field?.toLowerCase().includes(needle) === true;
}

export function isSearching(query: string): boolean {
  return query.trim() !== '';
}

/** A trimmed, case-insensitive match over the fields a row shows; an empty query keeps every row. */
export function matchesSearch(row: ConsoleRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  const agent = row.agent;
  return [
    row.hostName,
    agent.cwd,
    agent.agent,
    row.workspaceLabel,
    row.tabLabel,
    row.paneLabel,
    agent.title,
    agentDisplayName(agent),
    agent.terminal_title,
    agentTerminalTitleStripped(agent),
    agentTitle(agent),
  ].some((field) => contains(field, needle));
}

export function searchRows(rows: readonly ConsoleRow[], query: string): readonly ConsoleRow[] {
  return isSearching(query) ? rows.filter((row) => matchesSearch(row, query)) : rows;
}

/**
 * Groups rows (already filtered, in Console order with pinned first) for the Flat, Host and
 * Workspace presentations. A search drops Host groups without a match; without one every Host
 * stays, empty or not.
 */
export function groupRows(
  rows: readonly ConsoleRow[],
  presentation: Exclude<ListPresentation, 'byStatus'>,
  options: { hosts: readonly HostName[]; query?: string; hostId?: string },
): readonly ListGroup[] {
  if (presentation === 'flat') return [{ id: 'all', kind: 'flat', rows }];
  if (presentation === 'byHost') {
    const searching = isSearching(options.query ?? '');
    return options.hosts
      .filter((host) => options.hostId === undefined || host.id === options.hostId)
      .map((host) => ({
        id: host.id,
        kind: 'host' as const,
        title: host.name,
        hostId: host.id,
        rows: rows.filter((row) => row.hostId === host.id),
      }))
      .filter((group) => !searching || group.rows.length > 0);
  }
  // Workspaces exist through their Agents; first sighting fixes the order, so a pinned Agent's
  // Workspace comes first.
  const byId = new Map<string, ConsoleRow[]>();
  for (const row of rows) {
    const id = `${row.hostId}\u001f${row.agent.workspace_id}`;
    byId.set(id, [...(byId.get(id) ?? []), row]);
  }
  return [...byId].map(([id, members]) => ({
    id,
    kind: 'workspace' as const,
    title: members.find((row) => (row.workspaceLabel ?? '').trim() !== '')?.workspaceLabel,
    hostId: members[0]?.hostId,
    rows: members,
  }));
}

/** By Status sections in their fixed order; a search drops the empty ones. */
export function statusGroups(
  items: Partial<Record<StatusInboxSection, readonly StatusInboxItem[]>>,
  query = '',
): readonly ListGroup[] {
  const searching = isSearching(query);
  return STATUS_INBOX_SECTIONS.flatMap((section) => {
    const members = items[section] ?? [];
    if (searching && members.length === 0) return [];
    return [
      { id: section, kind: 'status' as const, section, rows: members.map((item) => item.row) },
    ];
  });
}

/** Whether a group's rows are listed: a search opens every group so no match hides. */
export function isGroupOpen(id: string, collapsed: ReadonlySet<string>, query: string): boolean {
  return isSearching(query) || !collapsed.has(id);
}
