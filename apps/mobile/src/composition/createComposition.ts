import type { Clock, Host, KeyValueStorage, LiveUsageSource } from '@openagentspocket/core';
import { hostDisplayName } from '@openagentspocket/core';
import type { HostPlatform, SshTransport } from '@openagentspocket/transport';
import type { ChangesStoreFactory } from '@/changes/registry';
import type { ConsoleStore } from '@/console/store';
import type { NewAgentServices } from '@/features/new-agent/services';
import type { FileBrowserSource } from '@/files/source';
import type { PortsStoreFactory } from '@/ports/registry';
import { sshPortsFactory } from '@/ports/sshHost';
import { liveChangesFactory } from './changesLive';
import { type HostAccess, HostGates, liveFileSource } from './hostAccess';
import { liveNewAgentServices } from './newAgentLive';
import { createUsageLive } from './usageLive';

export interface CompositionDeps {
  readonly access: HostAccess;
  readonly console: ConsoleStore<SshTransport>;
  readonly hosts: () => readonly Host[];
  readonly storage: KeyValueStorage;
  readonly clock: Clock;
  readonly openAgent: (hostId: string, paneId: string) => void;
  readonly openChanges: (hostId: string, directory: string) => void;
}

/** Everything the screens read from the live app, built once from the connections. */
export interface Composition {
  readonly newAgent: NewAgentServices;
  readonly usage: LiveUsageSource;
  readonly changesFactory: ChangesStoreFactory;
  readonly portsFactory: PortsStoreFactory;
  /** The Files source of a Host; undefined when the Host is not in the catalog. */
  fileSource(hostId: string, startPath?: string): FileBrowserSource | undefined;
  /** Native Windows Hosts lack a POSIX shell: Files, Ports and Changes hide for them. */
  platformOf(hostId: string): HostPlatform | undefined;
  /** Starts following the Console (Usage Hosts). Returns the stop function. */
  start(): () => void;
}

/** Registers every live factory once; the screens reach them through this object. */
export function createComposition(deps: CompositionDeps): Composition {
  const gates = new HostGates();
  const usage = createUsageLive(deps);
  return {
    newAgent: liveNewAgentServices({ ...deps, gates }),
    usage: usage.source,
    changesFactory: liveChangesFactory({ ...deps, gates }),
    portsFactory: sshPortsFactory((hostId) => deps.access.connectDedicated(hostId)),
    fileSource: (hostId, startPath) => {
      const host = deps.hosts().find((candidate) => candidate.id === hostId);
      if (!host) return undefined;
      return liveFileSource(
        deps.access,
        gates,
        { id: host.id, name: hostDisplayName(host) },
        startPath,
      );
    },
    platformOf: (hostId) => deps.access.platformOf(hostId),
    start: usage.follow,
  };
}
