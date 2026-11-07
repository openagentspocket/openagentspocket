import { systemClock } from '@openagentspocket/transport';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useConsoleStore } from '@/console/hooks';
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

  useEffect(() => {
    const created = new AgentTerminalSession(paneId, {
      runner: hostTerminalRunner(console, hostId),
      clock: systemClock,
      transportGeneration: () => console.transportGeneration(hostId),
      subscribe: console.subscribe,
    });
    setSession(created);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') created.didBecomeActive();
    });
    return () => {
      subscription.remove();
      void created.dispose();
      setSession(null);
    };
  }, [console, hostId, paneId]);

  return session;
}
