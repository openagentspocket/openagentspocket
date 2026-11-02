import { type Clock, HerdrApiError, type herdr, sleep } from '@openagentspocket/core';
import type { HerdrApi } from './herdr-api';
import { SHELL_READINESS_BUDGET_MS, SHELL_READINESS_RETRY_MS } from './settings';

/** What starts an Agent: its program kind, the name herdr shows, and where. */
export interface AgentLaunch {
  readonly kind: string;
  readonly name: string;
  readonly cwd?: string;
  readonly tabLabel?: string;
  readonly workspaceId?: string;
  readonly arguments?: readonly string[];
}

export interface ShellIdentity {
  readonly paneId: string;
  readonly tabId: string;
  readonly terminalId: string;
}

export interface NewWorkspace {
  readonly directory?: string;
  readonly label?: string;
}

const shellIdentity = (pane: herdr.PaneInfo): ShellIdentity => ({
  paneId: pane.pane_id,
  tabId: pane.tab_id,
  terminalId: pane.terminal_id,
});

/**
 * herdr answers `agent_pane_busy` while a startup command holds the fresh pane, and 0.9.4 on
 * macOS refuses a launch line longer than the terminal's canonical input limit until the
 * shell's line editor starts. Both are worth resending; every other refusal is final.
 */
export function isShellReadinessRefusal(error: HerdrApiError): boolean {
  return error.code === 'agent_pane_busy' || error.isCanonicalModeRefusal;
}

/** Cosmetic: a failed rename must not fail a start that already succeeded. */
async function renameQuietly(api: HerdrApi, tabId: string, label: string | undefined) {
  if (label === undefined) return;
  await api.renameTab({ tab_id: tabId, label }).catch(() => undefined);
}

/** Starts the agent in a fresh pane, resending while the pane's shell is not ready. */
async function startAwaitingShell(
  api: HerdrApi,
  clock: Clock,
  launch: AgentLaunch,
  paneId: string,
): Promise<herdr.AgentInfo> {
  const params = {
    kind: launch.kind,
    name: launch.name,
    pane_id: paneId,
    ...(launch.arguments?.length ? { args: [...launch.arguments] } : {}),
  };
  const deadline = clock.monotonicMs() + SHELL_READINESS_BUDGET_MS;
  for (;;) {
    try {
      return (await api.startAgentIn(params)).agent;
    } catch (error) {
      if (!(error instanceof HerdrApiError) || !isShellReadinessRefusal(error)) throw error;
      if (clock.monotonicMs() + SHELL_READINESS_RETRY_MS >= deadline) throw error;
      await sleep(clock, SHELL_READINESS_RETRY_MS).done;
    }
  }
}

/** Removes what a failed start created; the original refusal is what the caller sees. */
async function compensating<T>(work: () => Promise<T>, undo: () => Promise<unknown>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof HerdrApiError) await undo().catch(() => undefined);
    throw error;
  }
}

export async function createShellTerminal(
  api: HerdrApi,
  creation: { cwd?: string; label?: string; workspaceId?: string },
): Promise<ShellIdentity> {
  const created = await api.createTab({
    cwd: creation.cwd,
    focus: false,
    label: creation.label,
    workspace_id: creation.workspaceId,
  });
  return shellIdentity(created.root_pane);
}

export async function createShellWorkspace(
  api: HerdrApi,
  workspace: NewWorkspace,
  tabLabel?: string,
): Promise<ShellIdentity> {
  const created = await api.createWorkspace({
    cwd: workspace.directory,
    focus: false,
    label: workspace.label,
  });
  await renameQuietly(api, created.tab.tab_id, tabLabel);
  return shellIdentity(created.root_pane);
}

export async function startAgent(
  api: HerdrApi,
  clock: Clock,
  launch: AgentLaunch,
): Promise<herdr.AgentInfo> {
  const created = await api.createTab({
    cwd: launch.cwd,
    focus: false,
    label: launch.tabLabel,
    workspace_id: launch.workspaceId,
  });
  const paneId = created.root_pane.pane_id;
  return compensating(
    () => startAwaitingShell(api, clock, launch, paneId),
    () => api.closePane(paneId),
  );
}

export async function startAgentInNewWorkspace(
  api: HerdrApi,
  clock: Clock,
  launch: AgentLaunch,
  workspace: NewWorkspace,
): Promise<herdr.AgentInfo> {
  const created = await api.createWorkspace({
    cwd: workspace.directory,
    focus: false,
    label: workspace.label,
  });
  const agent = await compensating(
    () => startAwaitingShell(api, clock, launch, created.root_pane.pane_id),
    () => api.closeWorkspace(created.workspace.workspace_id),
  );
  await renameQuietly(api, created.tab.tab_id, launch.tabLabel);
  return agent;
}

export async function startAgentInNewWorktree(
  api: HerdrApi,
  clock: Clock,
  launch: AgentLaunch,
  worktree: { base?: string; branch?: string },
): Promise<herdr.AgentInfo> {
  const created = await api.createWorktree({
    base: worktree.base,
    branch: worktree.branch,
    focus: false,
    label: launch.name,
    workspace_id: launch.workspaceId,
  });
  const agent = await compensating(
    () => startAwaitingShell(api, clock, launch, created.root_pane.pane_id),
    () => api.removeWorktree({ workspace_id: created.workspace.workspace_id }),
  );
  await renameQuietly(api, created.tab.tab_id, launch.tabLabel);
  return agent;
}
