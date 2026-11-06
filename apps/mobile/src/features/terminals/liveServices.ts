import {
  type Clock,
  type ShellTerminalIdentity,
  type ShellTerminalMemory,
  type ShellTerminalRemote,
  TerminalConnectionPool,
} from '@openagentspocket/core';
import type { HerdrApi } from '@openagentspocket/transport';
import {
  hostTerminalRunner,
  type TerminalHostSource,
} from '@/agent-detail/terminal/terminalRunner';
import type { ShellTerminalServices } from './services';

/** The slice of the Console store shells run on. */
export interface ShellConsole extends TerminalHostSource {
  mutate<V>(hostId: string, operation: (api: HerdrApi) => Promise<V>): Promise<V>;
  transportGeneration(hostId: string): number | null;
  subscribe(listener: () => void): () => void;
}

function remoteFor(console: ShellConsole, hostId: string): ShellTerminalRemote {
  return {
    create: (request) =>
      console.mutate(hostId, async (api) => {
        const { root_pane: pane } = await api.createTab({
          workspace_id: request.workspaceId || null,
          cwd: request.cwd,
          label: request.label ?? null,
        });
        return { paneId: pane.pane_id, tabId: pane.tab_id, terminalId: pane.terminal_id };
      }),
    verify: (identity) =>
      console.mutate(hostId, async (api) => {
        const { panes } = await api.sessionSnapshot();
        return panes.some((pane) => pane.pane_id === identity.paneId);
      }),
    close: (identity) => console.mutate(hostId, (api) => api.closeTab(identity.tabId)),
  };
}

/** Shells on the Hosts the Console is connected to; a tab is remembered for this app run. */
export function createLiveShellServices(deps: {
  console: ShellConsole;
  clock: Clock;
  hostName(hostId: string): string;
}): ShellTerminalServices {
  const { console } = deps;
  const remembered = new Map<string, ShellTerminalIdentity>();
  return {
    pool: new TerminalConnectionPool({ clock: deps.clock }),
    hostName: deps.hostName,
    remote: (hostId) => remoteFor(console, hostId),
    memory: (hostId, key): ShellTerminalMemory => ({
      recall: () => remembered.get(`${hostId}/${key}`),
      remember: (identity) => void remembered.set(`${hostId}/${key}`, identity),
      forget: () => void remembered.delete(`${hostId}/${key}`),
    }),
    runner: (hostId) => hostTerminalRunner(console, hostId),
    generation: (hostId) => console.transportGeneration(hostId),
    subscribe: (listener) => console.subscribe(listener),
  };
}
