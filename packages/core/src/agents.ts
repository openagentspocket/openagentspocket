export type AgentStatus = 'blocked' | 'done' | 'working' | 'idle' | 'unknown';

/** One Agent row joined with the Host it lives on (mirrors the Swift Console row). */
export interface ConsoleAgent {
  hostId: string;
  hostName: string;
  paneId: string;
  name: string;
  status: AgentStatus;
  workspaceLabel?: string;
  summary?: string;
  /** Monotonic per Host; comparable only within one Host. */
  stateChangeSeq?: number;
}

const BUCKET: Record<AgentStatus, number> = {
  blocked: 0,
  done: 1,
  working: 2,
  idle: 3,
  unknown: 4,
};

/** Blocked leads: it is the only status the user can act on. */
export function sortBucket(status: AgentStatus): number {
  return BUCKET[status];
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Console order: status bucket, Host, newest state change, workspace, pane. */
export function consoleSorted(agents: readonly ConsoleAgent[]): ConsoleAgent[] {
  return [...agents].sort(
    (a, b) =>
      sortBucket(a.status) - sortBucket(b.status) ||
      compareText(a.hostName, b.hostName) ||
      compareText(a.hostId, b.hostId) ||
      (b.stateChangeSeq ?? 0) - (a.stateChangeSeq ?? 0) ||
      compareText(a.workspaceLabel ?? '', b.workspaceLabel ?? '') ||
      compareText(a.paneId, b.paneId),
  );
}

export type HomeSection = 'needsYou' | 'working' | 'done';

export function homeSectionFor(status: AgentStatus): HomeSection | null {
  if (status === 'blocked') return 'needsYou';
  if (status === 'working') return 'working';
  if (status === 'done') return 'done';
  return null;
}

/** Groups sorted agents into the Home sections; idle and unknown stay off Home. */
export function groupForHome(agents: readonly ConsoleAgent[]): Record<HomeSection, ConsoleAgent[]> {
  const groups: Record<HomeSection, ConsoleAgent[]> = { needsYou: [], working: [], done: [] };
  for (const agent of consoleSorted(agents)) {
    const section = homeSectionFor(agent.status);
    if (section) groups[section].push(agent);
  }
  return groups;
}
