import type { Clock } from '@openagentspocket/core';

/** Real timers for the Ports store (tests drive core's `FakeClock` instead). */
export const systemClock: Clock = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  monotonicMs: () => Date.now(),
};
