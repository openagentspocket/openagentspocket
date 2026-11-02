import type { EventsSessionStatus } from '../events/types';
import { type AgentPanelSort, rowSortKey, sortConsole } from './ordering';
import { type ConsoleRow, rowKey } from './row';
import type { AgentStatusClocks } from './status-clocks';

/** What the selector reads of one Host's projection; the projection satisfies it. */
export interface HostRowsView {
  readonly host: { readonly id: string };
  readonly agentsByPane: ReadonlyMap<string, ConsoleRow>;
  readonly status: EventsSessionStatus | undefined;
  readonly isAwaitingSnapshot: boolean;
}

/** What the selector reads of the pins; `PinnedAgents` satisfies it. */
export interface PinRanks {
  pinRank(hostId: string, paneId: string): number | undefined;
}

export interface SelectConsoleInput {
  readonly hosts: readonly HostRowsView[];
  readonly pins: PinRanks;
  readonly sortByHost?: ReadonlyMap<string, AgentPanelSort>;
  /** Told about every selection, so ages follow the rows. */
  readonly clocks?: Pick<AgentStatusClocks, 'agentsDidChange'>;
}

export interface ConsoleSelection {
  /** Every Host's Agents in Console order. */
  readonly rows: readonly ConsoleRow[];
  /** Hosts whose snapshot is current: an Agent missing from one of them is gone. */
  readonly readyHosts: ReadonlySet<string>;
}

/** A Host is ready when connected and its snapshot for this connection has landed. */
export function isHostReady(host: HostRowsView): boolean {
  return host.status?.kind === 'connected' && !host.isAwaitingSnapshot;
}

/** Joins every Host's rows in Console order: pins, then status bucket, Host, recency. */
export function selectConsole(input: SelectConsoleInput): ConsoleSelection {
  const readyHosts = new Set<string>();
  const all: ConsoleRow[] = [];
  for (const host of input.hosts) {
    if (isHostReady(host)) readyHosts.add(host.host.id);
    all.push(...host.agentsByPane.values());
  }
  const rows = sortConsole(all, rowSortKey, {
    sortByHost: input.sortByHost,
    pinRank: (row) => input.pins.pinRank(row.hostId, row.agent.pane_id),
  });
  input.clocks?.agentsDidChange(rows, readyHosts);
  return { rows, readyHosts };
}

/** The row for an Agent key (see `agentKey`), if it is listed. */
export function findRow(rows: readonly ConsoleRow[], key: string): ConsoleRow | undefined {
  return rows.find((row) => rowKey(row) === key);
}
