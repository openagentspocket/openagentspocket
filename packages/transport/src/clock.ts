import type { Clock } from '@openagentspocket/core';

// Timers exist in every JS runtime this runs on; the package compiles with `lib: ES2022` only.
declare function setTimeout(callback: () => void, ms: number): unknown;
declare function clearTimeout(handle: unknown): void;

/** The real timers; tests inject core's `FakeClock` instead. */
export const systemClock: Clock = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle),
  monotonicMs: () => Date.now(),
};
