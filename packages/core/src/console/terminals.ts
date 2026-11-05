import type { ConsoleTerminal } from './row';

/** The shell panes of one workspace on one Host: a card of the Terminals list. */
export interface TerminalGroup {
  /** `hostId/workspaceId`: stable across snapshots. */
  readonly id: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly workspaceId: string;
  readonly workspaceLabel: string;
  readonly terminals: readonly ConsoleTerminal[];
}

/** Groups terminals by Host and workspace, in the order each pair first appears. */
export function groupTerminals(terminals: readonly ConsoleTerminal[]): TerminalGroup[] {
  const groups = new Map<string, { head: ConsoleTerminal; items: ConsoleTerminal[] }>();
  for (const terminal of terminals) {
    const id = `${terminal.hostId}/${terminal.workspaceId}`;
    const group = groups.get(id) ?? { head: terminal, items: [] };
    group.items.push(terminal);
    groups.set(id, group);
  }
  return [...groups].map(([id, { head, items }]) => ({
    id,
    hostId: head.hostId,
    hostName: head.hostName,
    workspaceId: head.workspaceId,
    workspaceLabel: head.workspaceLabel ?? head.workspaceId,
    terminals: items,
  }));
}

/** The last path component, the name a shell without a label goes by. */
export function terminalTitle(terminal: ConsoleTerminal): string {
  if (terminal.label) return terminal.label;
  const parts = (terminal.cwd ?? '').split('/').filter(Boolean);
  return parts[parts.length - 1] ?? terminal.paneId;
}
