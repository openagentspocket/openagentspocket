import { type LaunchOrigin, StartAgentStore } from '@openagentspocket/core';
import { useStoreState } from '@openagentspocket/ui';
import { useEffect, useMemo } from 'react';
import { useNewAgentServices } from './services';

/**
 * The New Agent form's store for one visit. Detecting installed Agents and the Recent list
 * reload whenever the Host changes; neither blocks the form.
 */
export function useStartAgent(origin?: LaunchOrigin) {
  const services = useNewAgentServices();
  const originHost = origin?.hostId;
  const originWorkspace = origin?.workspaceId;
  const originCwd = origin?.cwd;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the origin's three fields are its identity
  const store = useMemo(
    () =>
      new StartAgentStore({
        hosts: services.hosts,
        environment: services.environment,
        recentWorkspaces: services.recentWorkspaces,
        recentDirectories: services.recentDirectories,
        origin,
      }),
    [services, originHost, originWorkspace, originCwd],
  );
  const state = useStoreState(store);
  const { selectedHostId } = state;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload per Host, not per keystroke
  useEffect(() => {
    void store.discoverAgents();
    void store.loadRecentDirectories();
  }, [store, selectedHostId]);
  return { store, state, services };
}
