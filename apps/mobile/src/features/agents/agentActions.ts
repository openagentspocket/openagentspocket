import type { ConsoleRow, ConsoleTransport } from '@openagentspocket/core';
import type { ConsoleStore } from '../../console/store';

/** The Host changes an Agent row can ask for; the live Transport (HerdrApi) provides them. */
export interface AgentMutations {
  closePane(paneId: string): Promise<void>;
  renameAgent(params: { target: string; name: string | null }): Promise<void>;
  renameWorkspace(params: { workspace_id: string; label: string }): Promise<void>;
}

function canMutate(transport: ConsoleTransport): transport is ConsoleTransport & AgentMutations {
  return (
    'closePane' in transport &&
    typeof transport.closePane === 'function' &&
    'renameAgent' in transport &&
    typeof transport.renameAgent === 'function' &&
    'renameWorkspace' in transport &&
    typeof transport.renameWorkspace === 'function'
  );
}

function mutations(transport: ConsoleTransport): AgentMutations {
  if (!canMutate(transport)) throw new Error('The Transport cannot change Agents.');
  return transport;
}

export interface AgentActions {
  togglePin(row: ConsoleRow): void;
  close(row: ConsoleRow): Promise<void>;
  /** An empty name restores the Agent's own. */
  rename(row: ConsoleRow, name: string): Promise<void>;
  /** The Workspace's label; an empty label is refused (the server would accept it, Swift does not). */
  renameWorkspace(row: ConsoleRow, label: string): Promise<void>;
}

/** Binds a row's actions to the Console store: the store relays them to the row's Host. */
export function agentActions(store: ConsoleStore): AgentActions {
  return {
    togglePin: (row) => store.togglePin(row.hostId, row.agent.pane_id),
    close: (row) =>
      store.mutate(row.hostId, (transport) => mutations(transport).closePane(row.agent.pane_id)),
    rename: (row, name) => {
      const trimmed = name.trim();
      return store.mutate(row.hostId, (transport) =>
        mutations(transport).renameAgent({
          target: row.agent.pane_id,
          name: trimmed === '' ? null : trimmed,
        }),
      );
    },
    renameWorkspace: (row, label) => {
      const trimmed = label.trim();
      if (trimmed === '') return Promise.resolve();
      return store.mutate(row.hostId, (transport) =>
        mutations(transport).renameWorkspace({
          workspace_id: row.agent.workspace_id,
          label: trimmed,
        }),
      );
    },
  };
}
