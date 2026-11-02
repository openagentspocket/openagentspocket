import { HERDR_PATH_EXPORT } from '@openagentspocket/core';

// Asks omp on the Host how large a model's context window is. The session file names the model
// but not its window; `omp models ls <selector> --json` prints it.

const SELECTOR_CHARACTERS = /^[A-Za-z0-9._:/+@-]+$/;
const MAX_WINDOW = 2_147_483_647;

/** `provider/model` as omp spells it; anything else is refused before it reaches a shell. */
export function isValidModelSelector(selector: string): boolean {
  return (
    selector.length > 0 &&
    selector.length <= 200 &&
    selector.includes('/') &&
    SELECTOR_CHARACTERS.test(selector)
  );
}

/** The exec command, or null for a selector that cannot be passed safely. */
export function modelProbeCommand(selector: string): string | null {
  if (!isValidModelSelector(selector)) return null;
  return `/bin/sh -c '${HERDR_PATH_EXPORT}; exec omp models ls ${selector} --json'`;
}

/**
 * The window of the entry whose `selector` matches exactly (the pattern is a substring filter),
 * or null when the output names no such model or is not omp's.
 */
export function modelContextWindow(output: string, selector: string): number | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { models } = parsed as { models?: unknown };
  if (!Array.isArray(models)) return null;
  const match = models.find(
    (model): model is Record<string, unknown> =>
      typeof model === 'object' &&
      model !== null &&
      (model as { selector?: unknown }).selector === selector,
  );
  const window = match?.contextWindow;
  if (typeof window !== 'number' || !Number.isFinite(window)) return null;
  return window >= 1 && window <= MAX_WINDOW ? Math.trunc(window) : null;
}
