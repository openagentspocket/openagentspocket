import type { KeyValueStorage } from '@openagentspocket/core';
import { useCallback, useState } from 'react';

/** What the detail screen shows for an Agent: its conversation or its terminal. */
export type Surface = 'chat' | 'terminal';

const STORAGE_KEY = 'agentDetail.surface';

/** Chat unless the user last chose the terminal. */
export function readSurface(storage: KeyValueStorage): Surface {
  return storage.getString(STORAGE_KEY) === 'terminal' ? 'terminal' : 'chat';
}

/** A deep-link param (`?surface=terminal`) as a Surface; anything else is no request. */
export function parseSurface(param: string | string[] | undefined): Surface | undefined {
  const value = Array.isArray(param) ? param[0] : param;
  return value === 'chat' || value === 'terminal' ? value : undefined;
}

/**
 * The surface in force and a setter that persists the choice. A deep link's surface wins for
 * this visit without overwriting the saved preference.
 */
export function useSurface(
  storage: KeyValueStorage,
  requested?: Surface,
  /** A new token re-applies `requested` on a detail that is already open (a Composer handoff). */
  request?: string,
): [Surface, (surface: Surface) => void] {
  const [chosen, setChosen] = useState<Surface | undefined>(requested);
  const [saved, setSaved] = useState(() => readSurface(storage));
  const [applied, setApplied] = useState(request);
  if (request !== applied) {
    setApplied(request);
    setChosen(requested);
  }
  const select = useCallback(
    (surface: Surface) => {
      storage.set(STORAGE_KEY, surface);
      setSaved(surface);
      setChosen(undefined);
    },
    [storage],
  );
  return [chosen ?? saved, select];
}
