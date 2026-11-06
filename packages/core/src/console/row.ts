import type { AgentContextUsage } from '../chat/model/types';
import type * as herdr from '../protocol/herdr-types.generated';
import { type AgentInfo, agentDisplayName, agentTitle, nonEmpty } from './agent-fields';

/** The checkout a workspace is bound to, when herdr reports one. */
export interface RepositoryCheckout {
  readonly repoKey: string;
  readonly repoName: string;
  readonly repoRoot: string;
  readonly checkoutPath: string;
  readonly isLinkedWorktree: boolean;
}

export function repositoryCheckout(info: herdr.WorkspaceWorktreeInfo): RepositoryCheckout {
  return {
    repoKey: info.repo_key,
    repoName: info.repo_name,
    repoRoot: info.repo_root,
    checkoutPath: info.checkout_path,
    isLinkedWorktree: info.is_linked_worktree,
  };
}

/** A workspace as the Console lists it, in snapshot order. */
export interface ConsoleWorkspace {
  readonly id: string;
  readonly label: string;
  readonly order: number;
  readonly checkoutPath?: string;
  /** Where a new shell opens: the checkout, or the directory of one of its panes. */
  readonly directory?: string;
}

/** A shell pane (one that runs no Agent) as the Terminals list shows it. */
export interface ConsoleTerminal {
  readonly hostId: string;
  readonly hostName: string;
  readonly paneId: string;
  readonly tabId: string;
  readonly terminalId: string;
  readonly workspaceId: string;
  readonly workspaceLabel?: string;
  /** The tab or pane name herdr reports, when there is one. */
  readonly label?: string;
  readonly cwd?: string;
}

/**
 * One Agent joined with the Host and snapshot facts the lists need. Immutable: a delta produces a
 * new row, so a stale reference never changes under a reader.
 */
export interface ConsoleRow {
  readonly hostId: string;
  readonly hostName: string;
  readonly hostUsername?: string;
  readonly agent: AgentInfo;
  readonly workspaceLabel?: string;
  readonly tabLabel?: string;
  readonly paneLabel?: string;
  /** The tab's 1-based position within its workspace, not herdr's stable tab number. */
  readonly tabPosition?: number;
  readonly workspaceTabCount: number;
  readonly tabPaneCount: number;
  readonly snapshotOrder?: number;
  readonly checkout?: RepositoryCheckout;
  /** What a Blocked Agent is asking, read from its terminal. */
  readonly lastOutputSnippet?: string;
  /** The live directory of the Agent's pane, newer than the Agent record's. */
  readonly paneDirectory?: string;
  /** Line totals of the Agent's checkout (the Changes read), when one is known. */
  readonly changeTotals?: RowChangeTotals;
  /** How full the Agent's context window is, when a transcript reports it. */
  readonly contextUsage?: AgentContextUsage;
}

export interface RowChangeTotals {
  readonly added: number;
  readonly removed: number;
}

/** At or below this share of the window left, the Agents list flags the Agent. */
export const CONTEXT_LOW_THRESHOLD = 0.2;

/** Share of the window still free, 0 to 1; an overrun prompt reads as 0. */
export function contextFractionLeft(usage: AgentContextUsage): number {
  if (usage.windowTokens <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - usage.usedTokens / usage.windowTokens));
}

/** "16 %" when the window runs low, else undefined: an Agent with room shows nothing. */
export function contextLowText(usage: AgentContextUsage | undefined): string | undefined {
  if (!usage || usage.windowTokens <= 0) return undefined;
  const left = contextFractionLeft(usage);
  return left <= CONTEXT_LOW_THRESHOLD ? `${Math.round(left * 100)} %` : undefined;
}

const KEY_SEPARATOR = '\u001f';

/** A stable identity for one Agent across Hosts (pane ids repeat between Hosts). */
export function agentKey(hostId: string, paneId: string): string {
  return `${hostId}${KEY_SEPARATOR}${paneId}`;
}

export function rowKey(row: Pick<ConsoleRow, 'hostId' | 'agent'>): string {
  return agentKey(row.hostId, row.agent.pane_id);
}

/** The Agent's directory: live pane cwd, else foreground cwd, cwd, checkout. */
export function rowDirectory(row: ConsoleRow): string | undefined {
  return (
    row.paneDirectory ??
    nonEmpty(row.agent.foreground_cwd) ??
    nonEmpty(row.agent.cwd) ??
    nonEmpty(row.checkout?.checkoutPath)
  );
}

/** Adopts a pane's directory when the pane is this Agent's own (same terminal, workspace, tab). */
export function withPaneDirectory(row: ConsoleRow, pane: herdr.PaneInfo): ConsoleRow {
  const agent = row.agent;
  if (
    pane.pane_id !== agent.pane_id ||
    pane.terminal_id !== agent.terminal_id ||
    pane.workspace_id !== agent.workspace_id ||
    pane.tab_id !== agent.tab_id
  ) {
    return row;
  }
  const paneDirectory = nonEmpty(pane.foreground_cwd) ?? nonEmpty(pane.cwd);
  return paneDirectory === row.paneDirectory ? row : { ...row, paneDirectory };
}

export function withStatus(row: ConsoleRow, status: herdr.AgentStatus): ConsoleRow {
  return row.agent.agent_status === status
    ? row
    : { ...row, agent: { ...row.agent, agent_status: status } };
}

/** Hide the tab label when it only repeats the tab's position in a one-tab workspace. */
export function showsTabLabel(row: ConsoleRow): boolean {
  const label = row.tabLabel;
  if (label === undefined || label === '') return false;
  if (row.workspaceTabCount > 1) return true;
  if (row.tabPosition === undefined) return true;
  return label !== String(row.tabPosition);
}

/** "workspace · repo", collapsing when both read the same. */
export function workspaceContext(row: ConsoleRow): string | undefined {
  const label = row.workspaceLabel;
  const repo = row.checkout?.repoName;
  if (label === undefined) return repo;
  if (repo === undefined) return label;
  return label === repo ? label : `${label} · ${repo}`;
}

/** The path with the Host user's home folded to `~`. */
export function displayPath(row: ConsoleRow, path: string): string {
  const user = row.hostUsername;
  if (!user) return path;
  const homes = user === 'root' ? ['/root'] : [`/Users/${user}`, `/home/${user}`];
  const home = homes.find((candidate) => path === candidate || path.startsWith(`${candidate}/`));
  if (home === undefined) return path;
  return path === home ? '~' : `~${path.slice(home.length)}`;
}

/** Case-insensitive match over the fields a row shows; a blank query matches everything. */
export function matchesAgentSearch(row: ConsoleRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  const agent = row.agent;
  const candidates = [
    row.hostName,
    agent.cwd,
    agent.agent,
    row.workspaceLabel,
    row.tabLabel,
    row.paneLabel,
    agentTitle(agent),
    agent.title,
    agentDisplayName(agent),
    agent.terminal_title,
    agent.terminal_title_stripped,
  ];
  return candidates.some((field) => !!field && field.toLowerCase().includes(needle));
}
