import { useSyncExternalStore } from 'react';
import type { HostsSnapshot } from './HostsModel';
import { hostsRuntime } from './hostsRuntime';

/** The saved Hosts, their connection state and whether the catalog could be read. */
export function useHosts(): HostsSnapshot {
  const { model } = hostsRuntime();
  return useSyncExternalStore(model.subscribe, model.getSnapshot);
}
