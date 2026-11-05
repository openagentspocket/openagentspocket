import type { StatusInboxItem, StatusInboxSection } from '@openagentspocket/core';
import type { HostSummary } from '@/console/store';

export const WORKING_CAP = 3;
export const DONE_CAP = 5;

export type InboxSections<T = StatusInboxItem> = Partial<Record<StatusInboxSection, T[]>>;

/** One Home section: the shown items and how many the section holds. */
export interface HomeInboxSection<T = StatusInboxItem> {
  readonly section: 'needsYou' | 'working' | 'doneRecent';
  readonly items: readonly T[];
  readonly total: number;
}

export type HostState = 'live' | 'loading' | 'offline';

/** Where a Host stands for its card: live, still loading, or not reachable (a confirmed failure). */
export function hostState(host: HostSummary): HostState {
  switch (host.link) {
    case 'live':
      return host.isAwaitingSnapshot && !host.isStale ? 'loading' : 'live';
    case 'resuming':
      return 'live';
    case 'connecting':
      return 'loading';
    case 'stopped':
    case 'offline':
      return 'offline';
  }
}

export interface HomeContent<T = StatusInboxItem> {
  readonly sections: readonly HomeInboxSection<T>[];
  readonly idleCount: number;
  /** Hosts still connecting with no snapshot: skeletons, never "All quiet". */
  readonly isLoading: boolean;
  readonly isQuiet: boolean;
  readonly offlineHosts: readonly HostSummary[];
}

const CAPS = { needsYou: undefined, working: WORKING_CAP, doneRecent: DONE_CAP } as const;

/**
 * What the Status Inbox shows: Needs you in full, Working and Done capped, a count of idle
 * Agents, and the Hosts whose Agents it cannot vouch for.
 */
export function homeContent<T = StatusInboxItem>(
  sections: InboxSections<T>,
  hosts: readonly HostSummary[],
): HomeContent<T> {
  const shown: HomeInboxSection<T>[] = [];
  for (const section of ['needsYou', 'working', 'doneRecent'] as const) {
    const items = sections[section] ?? [];
    if (items.length === 0) continue;
    shown.push({ section, items: items.slice(0, CAPS[section]), total: items.length });
  }
  const states = hosts.map(hostState);
  return {
    sections: shown,
    idleCount: sections.idle?.length ?? 0,
    isLoading: states.includes('loading'),
    isQuiet: shown.length === 0,
    offlineHosts: hosts.filter((_, index) => states[index] === 'offline'),
  };
}
