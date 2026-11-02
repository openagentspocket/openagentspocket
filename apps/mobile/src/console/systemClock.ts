import type { Clock } from '@openagentspocket/core';

/** Wall-clock timers for the running app. */
export const systemClock: Clock = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  monotonicMs: () => Date.now(),
};
