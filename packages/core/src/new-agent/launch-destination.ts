import type { ConsoleWorkspace } from '../console/row';
import type { LaunchDestination, LaunchOrigin } from './ports';
import { type StartAgentState, trimmedOrUndefined } from './start-agent-state';

/** Nil when the chosen target is incomplete, so a launch never invents a Workspace id. */
export function launchDestination(
  state: StartAgentState,
  origin: LaunchOrigin | undefined,
  selectedWorkspaceId: string | undefined,
): LaunchDestination | undefined {
  if (origin) return selectedWorkspaceId === undefined ? undefined : { kind: 'existingWorkspace' };
  if (state.launchTarget === 'newWorkspace') {
    const directory = trimmedOrUndefined(state.newWorkspaceDirectory);
    if (directory === undefined) return undefined;
    return {
      kind: 'newWorkspace',
      directory,
      label: trimmedOrUndefined(state.newWorkspaceLabel),
    };
  }
  if (selectedWorkspaceId === undefined) return undefined;
  if (state.startsInNewWorktree) {
    return {
      kind: 'newWorktree',
      branch: trimmedOrUndefined(state.worktreeBranch),
      base: trimmedOrUndefined(state.worktreeBase),
    };
  }
  return { kind: 'existingWorkspace' };
}

/** The directory a successful launch goes into the history as; a worktree records its source. */
export function startedDirectory(
  destination: LaunchDestination,
  origin: LaunchOrigin | undefined,
  workspace: ConsoleWorkspace | undefined,
  agentCwd: string | undefined,
): string | undefined {
  if (origin) return origin.cwd;
  const checkout = workspace?.checkoutPath;
  switch (destination.kind) {
    case 'newWorkspace':
      return destination.directory;
    case 'existingWorkspace':
      return checkout ?? trimmedOrUndefined(agentCwd ?? '');
    case 'newWorktree':
      return checkout;
  }
}
