import {
  type AgentStatus,
  type AgentStatusSource,
  ChangesStore,
  type Clock,
  createChangesReaders,
  rowDirectory,
} from '@openagentspocket/core';
import type { ChangesStoreFactory } from '@/changes/registry';
import { say } from '@/changes/say';
import { parseChangesTarget } from '@/changes/target';
import type { ConsoleStore } from '@/console/store';
import type { HostAccess, HostGates } from './hostAccess';

interface Deps {
  readonly access: HostAccess;
  readonly gates: HostGates;
  readonly console: Pick<ConsoleStore, 'getState' | 'subscribe'>;
  readonly clock: Clock;
}

const STATUSES: readonly AgentStatus[] = ['blocked', 'done', 'working', 'idle', 'unknown'];

function narrowStatus(status: string | undefined): AgentStatus | null {
  return STATUSES.find((known) => known === status) ?? (status === undefined ? null : 'unknown');
}

/** The Agent's status as the Console delivers it, for the store's automatic refresh. */
function statusSource(deps: Deps, hostId: string, paneId: string): AgentStatusSource {
  return (listener) => {
    let generation = 0;
    let connected = false;
    const emit = () => {
      const state = deps.console.getState();
      const isConnected =
        state.hosts.find((host) => host.id === hostId)?.status?.kind === 'connected';
      if (isConnected && !connected) generation += 1;
      connected = isConnected;
      const row = state.rows.find((r) => r.hostId === hostId && r.agent.pane_id === paneId);
      listener({
        status: narrowStatus(row?.agent.agent_status),
        liveUpdatesAvailable: isConnected,
        connectionGeneration: generation,
      });
    };
    emit();
    return deps.console.subscribe(emit);
  };
}

/** Changes stores that read git over the Host's live transport. Unknown ids read nothing. */
export function liveChangesFactory(deps: Deps): ChangesStoreFactory {
  return (id) => {
    const target = parseChangesTarget(id);
    const hostId = target?.hostId ?? '';
    const readers = createChangesReaders((command, options) =>
      deps.access.withTransport(hostId, (transport) => transport.session.exec(command, options)),
    );
    const directory = (): string | null => {
      if (!target) return null;
      if (target.kind === 'directory') return target.directory;
      const row = deps.console
        .getState()
        .rows.find((r) => r.hostId === hostId && r.agent.pane_id === target.paneId);
      return row ? (rowDirectory(row) ?? null) : null;
    };
    return new ChangesStore({
      directory,
      read: readers.read,
      readPatch: readers.readPatch,
      listUntrackedDirectory: readers.listUntrackedDirectory,
      gate: deps.gates.gate(hostId),
      agentStatus: target?.kind === 'agent' ? statusSource(deps, hostId, target.paneId) : undefined,
      clock: deps.clock,
      say,
    });
  };
}
