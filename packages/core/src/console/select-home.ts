import type { ConsoleRow } from './row';

export type HomeSection = 'needsYou' | 'working' | 'done';

export function homeSectionFor(status: string): HomeSection | null {
  if (status === 'blocked') return 'needsYou';
  if (status === 'working') return 'working';
  if (status === 'done') return 'done';
  return null;
}

/** Splits Console-ordered rows into the Home sections; idle and unknown stay off Home. */
export function groupForHome(rows: readonly ConsoleRow[]): Record<HomeSection, ConsoleRow[]> {
  const groups: Record<HomeSection, ConsoleRow[]> = { needsYou: [], working: [], done: [] };
  for (const row of rows) {
    const section = homeSectionFor(row.agent.agent_status);
    if (section) groups[section].push(row);
  }
  return groups;
}
