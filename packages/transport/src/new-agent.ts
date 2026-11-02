import {
  type Clock,
  HerdrApiError,
  type LaunchDestination,
  type LaunchRequest,
  type StartedAgent,
  TransportFailure,
  type WorktreeListing,
  WorktreeRemovalError,
  type WorktreeRemovalReceipt,
  type WorktreeRemovalRequest,
} from '@openagentspocket/core';
import type { HerdrApi } from './herdr-api';
import {
  type AgentLaunch,
  startAgent,
  startAgentInNewWorkspace,
  startAgentInNewWorktree,
} from './launch';

function started(agent: {
  pane_id: string;
  workspace_id: string;
  cwd?: string | null;
}): StartedAgent {
  return {
    paneId: agent.pane_id,
    workspaceId: agent.workspace_id,
    ...(agent.cwd ? { cwd: agent.cwd } : {}),
  };
}

/**
 * Dispatches the New Agent form's launch through the matching launch flow: an existing
 * Workspace, a fresh worktree of it, or a new Workspace at a directory. The pane that surfaces
 * reaches the Console through its normal snapshot and events.
 */
export async function launchAgent(
  api: HerdrApi,
  clock: Clock,
  request: LaunchRequest,
  destination: LaunchDestination,
): Promise<StartedAgent> {
  const launch: AgentLaunch = {
    kind: request.kind,
    name: request.name,
    cwd: request.cwd,
    tabLabel: request.tabLabel,
    workspaceId: request.workspaceId,
    arguments: request.arguments,
  };
  switch (destination.kind) {
    case 'existingWorkspace':
      return started(await startAgent(api, clock, launch));
    case 'newWorktree':
      return started(
        await startAgentInNewWorktree(api, clock, launch, {
          base: destination.base,
          branch: destination.branch,
        }),
      );
    case 'newWorkspace':
      return started(
        await startAgentInNewWorkspace(
          api,
          clock,
          { ...launch, cwd: undefined, workspaceId: undefined },
          { directory: destination.directory, label: destination.label },
        ),
      );
  }
}

/** `worktree.list` as Worktree Details reads it. */
export async function listWorktreeEntries(
  api: HerdrApi,
  workspaceId: string,
): Promise<WorktreeListing> {
  const result = await api.listWorktrees(workspaceId);
  return {
    repoKey: result.source.repo_key,
    worktrees: result.worktrees.map((worktree) => ({
      path: worktree.path,
      ...(worktree.branch ? { branch: worktree.branch } : {}),
      isDetached: worktree.is_detached,
      isLinkedWorktree: worktree.is_linked_worktree,
      ...(worktree.open_workspace_id ? { openWorkspaceId: worktree.open_workspace_id } : {}),
    })),
  };
}

/** What the removal needs from the Console: the proof the worktree is still the one confirmed. */
export interface RemovalGuard {
  /**
   * Called after the request is admitted and before the first byte is written. Throws
   * `WorktreeRemovalError('staleIdentity')` unless the Host's current snapshot still shows the
   * exact linked worktree; returns the Agent keys that the removal will end.
   */
  authorize(request: WorktreeRemovalRequest): ReadonlySet<string>;
}

const isDefiniteRejection = (error: unknown) =>
  error instanceof HerdrApiError ||
  (error instanceof TransportFailure &&
    (error.error.kind === 'apiRejected' || error.error.kind === 'cancelled'));

/**
 * Removes a linked worktree on the Host, one operation per request and per worktree. A failure
 * stale proof stops before anything is written; once the request may have reached the Host,
 * anything but a definite rejection is "unconfirmed", never success.
 */
export class WorktreeRemover {
  private readonly active = new Set<string>();

  constructor(private readonly api: HerdrApi) {}

  async remove(
    request: WorktreeRemovalRequest,
    guard: RemovalGuard,
  ): Promise<WorktreeRemovalReceipt> {
    const { identity } = request;
    const key = `${identity.hostId}\u0000${identity.workspaceId}\u0000${identity.checkoutPath}`;
    if (this.active.has(key)) throw new WorktreeRemovalError('alreadyInProgress');
    this.active.add(key);
    try {
      const affectedAgentKeys = guard.authorize(request);
      try {
        const result = await this.api.removeWorktree({ workspace_id: identity.workspaceId });
        if (result.workspace_id !== identity.workspaceId) {
          throw new WorktreeRemovalError('outcomeUnconfirmed');
        }
        return { request, affectedAgentKeys };
      } catch (error) {
        if (error instanceof WorktreeRemovalError) throw error;
        if (isDefiniteRejection(error)) throw error;
        throw new WorktreeRemovalError('outcomeUnconfirmed');
      }
    } finally {
      this.active.delete(key);
    }
  }
}
