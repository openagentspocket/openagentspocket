import { AgentFieldsStore } from '@openagentspocket/core';
import { useSyncExternalStore } from 'react';
import { deviceStorage } from '../deviceStorage';

let store: AgentFieldsStore | undefined;

/** The one store of per-Host Agent row layouts, kept on the device (opened on first use). */
export const agentFieldsStore = (): AgentFieldsStore => {
  store ??= new AgentFieldsStore(deviceStorage);
  return store;
};

/** Re-renders on any layout change; read the rows and the unreadable flag from the store. */
export function useAgentFields(): AgentFieldsStore {
  const current = agentFieldsStore();
  useSyncExternalStore(current.subscribe, current.snapshot);
  return current;
}
