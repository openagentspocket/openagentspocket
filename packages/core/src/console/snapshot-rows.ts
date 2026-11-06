import type * as herdr from '../protocol/herdr-types.generated';
import {
  type ConsoleRow,
  type ConsoleTerminal,
  type ConsoleWorkspace,
  repositoryCheckout,
  withPaneDirectory,
  withStatus,
} from './row';

/** The Host facts a row carries. */
export interface HostIdentity {
  readonly id: string;
  readonly name: string;
  readonly username?: string;
}

/** A delta observed while a snapshot request was in flight, stamped with its arrival order. */
export interface Stamped<V> {
  readonly revision: number;
  readonly value: V;
}

export interface SnapshotInputs {
  readonly host: HostIdentity;
  readonly snapshot: herdr.SessionSnapshot;
  /** Rows of the previous projection, for the snippet a refresh has not replaced yet. */
  readonly previous: ReadonlyMap<string, ConsoleRow>;
  /** Pane changes seen since the request started; only those newer than `paneStart` apply. */
  readonly paneChanges: ReadonlyMap<string, Stamped<herdr.PaneInfo>>;
  readonly paneStart: number;
  readonly statusChanges: ReadonlyMap<string, Stamped<herdr.AgentStatus>>;
  readonly statusStart: number;
}

export interface ProjectedSnapshot {
  readonly agents: Map<string, ConsoleRow>;
  readonly workspaces: ConsoleWorkspace[];
  /** Panes that run no Agent, in snapshot order. */
  readonly terminals: ConsoleTerminal[];
}

function firstBy<V>(items: readonly V[], key: (item: V) => string): Map<string, V> {
  const out = new Map<string, V>();
  for (const item of items) if (!out.has(key(item))) out.set(key(item), item);
  return out;
}

/**
 * Joins a snapshot into Console rows. The snapshot is the truth, but deltas that arrived after
 * its request began are newer than its response and are re-applied over it.
 */
export function projectSnapshot(input: SnapshotInputs): ProjectedSnapshot {
  const { host, snapshot } = input;
  const paneById = firstBy(snapshot.panes, (pane) => pane.pane_id);
  const workspaceById = firstBy(snapshot.workspaces, (workspace) => workspace.workspace_id);
  const tabById = firstBy(snapshot.tabs, (tab) => tab.tab_id);
  const tabCounts = new Map<string, number>();
  const tabPositions = new Map<string, number>();
  for (const tab of snapshot.tabs) {
    if (tabPositions.has(tab.tab_id)) continue;
    const count = (tabCounts.get(tab.workspace_id) ?? 0) + 1;
    tabCounts.set(tab.workspace_id, count);
    tabPositions.set(tab.tab_id, count);
  }
  const tabPaneIds = new Map<string, Set<string>>();
  const notePane = (tabId: string, paneId: string) => {
    const set = tabPaneIds.get(tabId) ?? new Set<string>();
    set.add(paneId);
    tabPaneIds.set(tabId, set);
  };
  for (const pane of snapshot.panes) notePane(pane.tab_id, pane.pane_id);
  for (const agent of snapshot.agents) notePane(agent.tab_id, agent.pane_id);

  const agents = new Map<string, ConsoleRow>();
  snapshot.agents.forEach((info, snapshotOrder) => {
    const workspace = workspaceById.get(info.workspace_id);
    const candidateTab = tabById.get(info.tab_id);
    const tab = candidateTab?.workspace_id === info.workspace_id ? candidateTab : undefined;
    const pane = paneById.get(info.pane_id);
    const paneBelongs = pane?.tab_id === info.tab_id && pane.workspace_id === info.workspace_id;
    let row: ConsoleRow = {
      hostId: host.id,
      hostName: host.name,
      hostUsername: host.username,
      agent: info,
      workspaceLabel: workspace?.label,
      checkout: workspace?.worktree ? repositoryCheckout(workspace.worktree) : undefined,
      lastOutputSnippet: input.previous.get(info.pane_id)?.lastOutputSnippet,
      tabLabel: tab?.label,
      tabPosition: tab ? tabPositions.get(tab.tab_id) : undefined,
      workspaceTabCount: Math.max(workspace?.tab_count ?? 0, tabCounts.get(info.workspace_id) ?? 0),
      tabPaneCount: Math.max(tab?.pane_count ?? 0, tabPaneIds.get(info.tab_id)?.size ?? 0),
      snapshotOrder,
      paneLabel: paneBelongs ? (pane.label ?? undefined) : undefined,
    };
    if (pane) row = withPaneDirectory(row, pane);
    // A live directory observed during this request is newer than its response.
    const change = input.paneChanges.get(info.pane_id);
    if (change && change.revision > input.paneStart) row = withPaneDirectory(row, change.value);
    agents.set(info.pane_id, row);
  });

  for (const [paneId, change] of input.statusChanges) {
    const row = agents.get(paneId);
    if (change.revision > input.statusStart && row)
      agents.set(paneId, withStatus(row, change.value));
  }
  for (const [paneId, row] of agents) {
    if (row.agent.agent_status !== 'blocked' && row.lastOutputSnippet !== undefined) {
      agents.set(paneId, { ...row, lastOutputSnippet: undefined });
    }
  }

  const workspaces = snapshot.workspaces
    .map(
      (workspace, order): ConsoleWorkspace => ({
        id: workspace.workspace_id,
        label: workspace.label,
        order,
        checkoutPath: workspace.worktree?.checkout_path,
        directory:
          workspace.worktree?.checkout_path ??
          snapshot.panes.find((pane) => pane.workspace_id === workspace.workspace_id && pane.cwd)
            ?.cwd ??
          undefined,
      }),
    )
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'accent' }));
  const agentPanes = new Set(snapshot.agents.map((agent) => agent.pane_id));
  const terminals = snapshot.panes
    .filter((pane) => !agentPanes.has(pane.pane_id))
    .map(
      (pane): ConsoleTerminal => ({
        hostId: host.id,
        hostName: host.name,
        paneId: pane.pane_id,
        tabId: pane.tab_id,
        terminalId: pane.terminal_id,
        workspaceId: pane.workspace_id,
        workspaceLabel: workspaceById.get(pane.workspace_id)?.label,
        label: pane.label ?? undefined,
        cwd: pane.foreground_cwd ?? pane.cwd ?? undefined,
      }),
    );
  return { agents, workspaces, terminals };
}
