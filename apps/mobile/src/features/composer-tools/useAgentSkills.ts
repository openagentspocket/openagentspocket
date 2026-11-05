import { type AgentSkill, SkillsPaneStore } from '@openagentspocket/core';
import { listSkills, SshTransport } from '@openagentspocket/transport';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useConsoleStore } from '@/console/hooks';

type FetchSkills = (query: {
  hostId: string;
  kind: string;
  projectRoot?: string;
}) => Promise<readonly AgentSkill[]>;

interface Input {
  hostId: string;
  /** The canonical Agent kind the Host's skill sources are looked up by. */
  program: string;
  /** The Agent's launch directory: its project skills are listed too. */
  projectRoot?: string;
  /** Loads only once something asks for them (Chat's `/` menu is on screen). */
  enabled?: boolean;
  /** Replaces the Host read (tests). */
  fetchSkills?: FetchSkills;
}

const NONE: readonly AgentSkill[] = [];

/** The pane store over the Host's skill listing for one Agent kind (the Skills sheet shows it). */
export function useSkillsPaneStore({
  hostId,
  program,
  projectRoot,
  fetchSkills,
}: Omit<Input, 'enabled'>): SkillsPaneStore {
  const consoleStore = useConsoleStore();
  return useMemo(
    () =>
      new SkillsPaneStore({
        fetch: async () => {
          if (fetchSkills) return fetchSkills({ hostId, kind: program, projectRoot });
          return consoleStore.withTransport(hostId, async (transport) =>
            transport instanceof SshTransport
              ? listSkills(transport, { kind: program, projectRoot })
              : [],
          );
        },
      }),
    [consoleStore, fetchSkills, hostId, program, projectRoot],
  );
}

/**
 * The skills and custom commands installed on the Host for one Agent kind, loaded lazily and kept
 * across renders; empty until loaded, and when the Host cannot list them. Any surface that offers
 * skills uses it: the Chat `/` menu, the Skills pane. Filtering for a program is the caller's.
 */
export function useAgentSkills({
  hostId,
  program,
  projectRoot,
  enabled = true,
  fetchSkills,
}: Input): readonly AgentSkill[] {
  const store = useSkillsPaneStore({ hostId, program, projectRoot, fetchSkills });
  useEffect(() => {
    if (enabled) void store.loadIfNeeded();
  }, [enabled, store]);
  return useSyncExternalStore(
    store.subscribe.bind(store),
    () => store.skills ?? NONE,
    () => NONE,
  );
}
