import { agentKey, programModes, readProgramMode, screenText } from '@openagentspocket/core';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { cardText } from '@/blocked/text';
import { useAgentScreenIO } from './useAgentScreenIO';

/** Lets a key just pressed settle on the Agent's screen before it is read. */
const SETTLE_MS = 400;

const asks = new Map<string, number>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Reads the Agent's mode again: a key that may have changed it was just pressed. */
export function refreshAgentMode(hostId: string, paneId: string): void {
  const key = agentKey(hostId, paneId);
  asks.set(key, (asks.get(key) ?? 0) + 1);
  for (const listener of listeners) listener();
}

/**
 * The Agent's mode as its screen names it (any program that lists its modes), read when the Agent
 * opens, when its status changes and after a shortcut; null for a program that names none.
 */
export function useAgentMode(
  hostId: string,
  paneId: string,
  program: string | null | undefined,
  status: string,
): string | null {
  const modes = useMemo(() => programModes(program), [program]);
  const io = useAgentScreenIO(hostId, paneId);
  const key = agentKey(hostId, paneId);
  const asked = useSyncExternalStore(subscribe, () => asks.get(key) ?? 0);
  const [mode, setMode] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new status is a reason to read again.
  useEffect(() => {
    if (!modes) return;
    let live = true;
    const timer = setTimeout(
      () =>
        void io
          .readScreen()
          .then((screen) => {
            const named = readProgramMode(modes, screenText(screen));
            if (live) setMode(named ? cardText(named) : null);
          })
          // A screen that cannot be read leaves the last mode shown.
          .catch(() => {}),
      asked > 0 ? SETTLE_MS : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [modes, io, asked, status]);
  return modes ? mode : null;
}
