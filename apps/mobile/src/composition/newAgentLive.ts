import {
  type Clock,
  type Host,
  hostDisplayName,
  type KeyValueStorage,
  type RecentDirectories,
  type RecentDirectory,
  StoredRecentWorkspaces,
} from '@openagentspocket/core';
import {
  availableAgentKinds,
  hostHomeDirectory,
  mergeRecentDirectories,
  probeRecentDirectories,
  RecentDirectoryHistory,
  recentDirectoryEntries,
} from '@openagentspocket/transport';
import { createLiveServices, type LiveConsole } from '@/features/new-agent/liveServices';
import type { NewAgentServices } from '@/features/new-agent/services';
import { ExpoLocalFiles } from '@/files/expoLocalFiles';
import { type HostAccess, type HostGates, liveFileBrowserHost } from './hostAccess';

/** The Recent section: the app's history and live workspaces at once, the Host's answer after. */
export function liveRecentDirectories(
  access: HostAccess,
  storage: KeyValueStorage,
): RecentDirectories {
  const history = new RecentDirectoryHistory(storage);
  const homes = new Map<string, string>();
  return {
    quick: (hostId, live) =>
      recentDirectoryEntries(
        mergeRecentDirectories({
          history: history.directories(hostId),
          live,
          discovered: [],
          verified: null,
        }),
        homes.get(hostId) ?? null,
      ),
    async refine(hostId, live): Promise<readonly RecentDirectory[] | undefined> {
      const known = history.directories(hostId);
      const result = await access.withTransport(hostId, (transport) =>
        probeRecentDirectories(transport, [...known, ...live]),
      );
      if (!result) return undefined;
      if (result.home) homes.set(hostId, result.home);
      return recentDirectoryEntries(
        mergeRecentDirectories({
          history: known,
          live,
          discovered: result.discovered,
          verified: result.existingCandidates,
        }),
        result.home,
      );
    },
    remember: (hostId, path) => history.remember(path, hostId),
  };
}

export interface NewAgentWiring {
  readonly access: HostAccess;
  readonly gates: HostGates;
  readonly console: LiveConsole;
  readonly hosts: () => readonly Host[];
  readonly storage: KeyValueStorage;
  readonly clock: Clock;
  openAgent(hostId: string, paneId: string): void;
  openChanges(hostId: string, directory: string): void;
}

/** The New Agent services over the live Console store and the Host transports. */
export function liveNewAgentServices(wiring: NewAgentWiring): NewAgentServices {
  const { access } = wiring;
  const hostOf = (hostId: string) => wiring.hosts().find((host) => host.id === hostId);
  const local = new ExpoLocalFiles();
  return createLiveServices({
    console: wiring.console,
    clock: wiring.clock,
    hosts: () => wiring.hosts().map((host) => ({ id: host.id, name: hostDisplayName(host) })),
    discoverAgentKinds: (hostId) =>
      access.withTransport(hostId, (transport) => availableAgentKinds(transport)),
    remoteHome: (hostId) =>
      access.withTransport(hostId, (transport) => hostHomeDirectory(transport)),
    fileBrowserHost: (hostId) => liveFileBrowserHost(access, wiring.gates, hostId, local),
    session: (hostId) => {
      const host = hostOf(hostId);
      return {
        sessionName: host?.sessionName ?? '',
        endpoint: host?.herdrEndpoint ?? undefined,
      };
    },
    recentWorkspaces: new StoredRecentWorkspaces(wiring.storage),
    recentDirectories: liveRecentDirectories(access, wiring.storage),
    openAgent: wiring.openAgent,
    openChanges: wiring.openChanges,
  });
}
