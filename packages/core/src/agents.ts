import { sortConsole } from './console/ordering';

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

/** Console order for the flat demo/Home Agent; see `sortConsole` for the full comparator. */
export function consoleSorted(agents: readonly ConsoleAgent[]): ConsoleAgent[] {
  return sortConsole(agents, (agent) => agent);
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
