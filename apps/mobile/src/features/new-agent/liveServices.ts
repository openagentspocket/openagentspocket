import {
  agentKey,
  type Clock,
  type ConsoleWorkspace,
  type DirectoryLister,
  directoryListerFor,
  type FileBrowserHost,
  type HerdrEndpoint,
  identityMatches,
  type LaunchHost,
  type NewAgentEnvironment,
  type RecentDirectories,
  type RecentWorkspaces,
  WorktreeRemovalError,
  worktreeIdentity,
  worktreeRemovalRequest,
} from '@openagentspocket/core';
import {
  type HerdrApi,
  launchAgent,
  listWorktreeEntries,
  WorktreeRemover,
} from '@openagentspocket/transport';
import type { ConsoleState } from '@/console/store';
import type { NewAgentServices } from './services';

/** The slice of the Console store the New Agent flow reads and mutates through. */
export interface LiveConsole {
  getState(): Pick<ConsoleState, 'rows'>;
  subscribe(listener: () => void): () => void;
  workspaces(hostId: string): readonly ConsoleWorkspace[];
  mutate<V>(hostId: string, operation: (api: HerdrApi) => Promise<V>): Promise<V>;
}

export interface LiveServicesDeps {
  readonly console: LiveConsole;
  readonly clock: Clock;
  readonly hosts: () => readonly LaunchHost[];
  /** Kinds installed on a Host (transport/host `availableAgentKinds`), in catalog order. */
  discoverAgentKinds(hostId: string): Promise<readonly string[]>;
  /** The Host's home directory (transport/host `hostHomeDirectory`). */
  remoteHome(hostId: string): Promise<string>;
  /** The file-browser view of a Host, for the directory browser. */
  fileBrowserHost(hostId: string): FileBrowserHost;
  /** The herdr session a Host targets, so a recovery command aims at the same instance. */
  session(hostId: string): { sessionName: string; endpoint?: HerdrEndpoint };
  readonly recentWorkspaces: RecentWorkspaces;
  readonly recentDirectories: RecentDirectories;
  openAgent?(hostId: string, paneId: string): void;
  openChanges?(hostId: string, directory: string): void;
}

/** How long a started Agent is awaited in the Console before the owner navigates anyway. */
export const VISIBLE_WAIT_MS = 5000;

function awaitVisible(deps: LiveServicesDeps, hostId: string, paneId: string): Promise<void> {
  const present = () =>
    deps.console
      .getState()
      .rows.some((row) => row.hostId === hostId && row.agent.pane_id === paneId);
  if (present()) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      deps.clock.clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    const unsubscribe = deps.console.subscribe(() => present() && finish());
    const timer = deps.clock.setTimeout(finish, VISIBLE_WAIT_MS);
  });
}

function environment(deps: LiveServicesDeps): NewAgentEnvironment {
  const rowsOf = (hostId: string) =>
    deps.console.getState().rows.filter((row) => row.hostId === hostId);
  return {
    workspaces: (hostId) => deps.console.workspaces(hostId),
    existingAgentNames: (hostId) =>
      new Set(rowsOf(hostId).flatMap((row) => (row.agent.name ? [row.agent.name] : []))),
    liveDirectories: (hostId) =>
      rowsOf(hostId).flatMap((row) => (row.agent.cwd ? [row.agent.cwd] : [])),
    discoverAgentKinds: (hostId) => deps.discoverAgentKinds(hostId),
    remoteHome: (hostId) => deps.remoteHome(hostId),
    start: (request, destination, hostId) =>
      deps.console.mutate(hostId, (api) => launchAgent(api, deps.clock, request, destination)),
    awaitAgentVisible: (hostId, paneId) => awaitVisible(deps, hostId, paneId),
  };
}

/** The New Agent and Worktree Details services over the live Console store. */
export function createLiveServices(deps: LiveServicesDeps): NewAgentServices {
  const removers = new WeakMap<HerdrApi, WorktreeRemover>();
  const lister = (hostId: string): DirectoryLister =>
    directoryListerFor(deps.fileBrowserHost(hostId));
  return {
    get hosts() {
      return deps.hosts();
    },
    environment: environment(deps),
    recentWorkspaces: deps.recentWorkspaces,
    recentDirectories: deps.recentDirectories,
    directoryLister: lister,
    openAgent: deps.openAgent,
    openChanges: deps.openChanges,
    worktreeDetail: (hostId, paneId) => {
      const rows = () => deps.console.getState().rows.filter((row) => row.hostId === hostId);
      const row = rows().find((candidate) => candidate.agent.pane_id === paneId);
      if (!row?.checkout?.isLinkedWorktree) return undefined;
      const { checkout } = row;
      const workspaceId = row.agent.workspace_id;
      const identity = worktreeIdentity(hostId, workspaceId, checkout);
      const inWorkspace = () =>
        rows().filter(
          (candidate) =>
            candidate.agent.workspace_id === workspaceId &&
            candidate.checkout !== undefined &&
            identityMatches(identity, candidate.checkout),
        );
      return {
        request: worktreeRemovalRequest(identity),
        workspaceLabel: row.workspaceLabel ?? checkout.repoName,
        checkout,
        ...deps.session(hostId),
        list: (id) => deps.console.mutate(hostId, (api) => listWorktreeEntries(api, id)),
        remove: (request) =>
          deps.console.mutate(hostId, (api) => {
            const remover = removers.get(api) ?? new WorktreeRemover(api);
            removers.set(api, remover);
            return remover.remove(request, {
              authorize: () => {
                const live = inWorkspace();
                // The snapshot must still show this exact linked worktree in this workspace.
                if (live.length === 0) throw new WorktreeRemovalError('staleIdentity');
                return new Set(live.map((r) => agentKey(r.hostId, r.agent.pane_id)));
              },
            });
          }),
        hasWorkingAgent: () => inWorkspace().some((r) => r.agent.agent_status === 'working'),
      };
    },
  };
}
