import { agentKey, targetKey } from '@openagentspocket/core';
import { systemClock } from '@openagentspocket/transport';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAgent, useConsoleStore } from '@/console/hooks';
import { attachTargetOf } from '../paneAddressing';
import { AgentTerminalSession } from './AgentTerminalSession';
import { hostTerminalRunner } from './terminalRunner';

/**
 * The terminal session of one Agent detail visit, created after mount (so a strict-mode remount
 * never reuses a disposed one) and disposed on unmount. Foreground returns reconcile the Host's
 * Transport generation with the attach pipeline's.
 */
export function useAgentTerminalSession(
  hostId: string,
  paneId: string,
): AgentTerminalSession | null {
  const console = useConsoleStore();
  const [session, setSession] = useState<AgentTerminalSession | null>(null);
  const target = attachTargetOf(useAgent(agentKey(hostId, paneId)), paneId);
  const targetId = targetKey(target);

  // A new target (herdr started or stopped detecting the Agent) is a new session; `targetId` stands
  // for `target`, a new object on every render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by `targetId`.
  useEffect(() => {
    const created = new AgentTerminalSession(
      paneId,
      {
        runner: hostTerminalRunner(console, hostId),
        clock: systemClock,
        transportGeneration: () => console.transportGeneration(hostId),
        subscribe: console.subscribe,
      },
      target,
    );
    setSession(created);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') created.didBecomeActive();
    });
    return () => {
      subscription.remove();
      void created.dispose();
      setSession(null);
    };
  }, [console, hostId, paneId, targetId]);

  return session;
}
