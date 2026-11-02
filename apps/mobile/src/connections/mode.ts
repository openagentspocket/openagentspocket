import type { KeyValueStorage } from '@openagentspocket/core';

const STORAGE_KEY = 'demo-mode';

let override: boolean | undefined;
let storage: KeyValueStorage | undefined;
const listeners = new Set<() => void>();

/** Where the Settings switch is remembered; the app root binds the device storage. */
export function bindDemoModeStorage(next: KeyValueStorage | undefined): void {
  storage = next;
  notify();
}

/**
 * Demo mode swaps the live connections for scripted data. It is explicit: `setDemoMode(true)`
 * (tests, the gallery), the `EXPO_PUBLIC_DEMO=1` dev flag, or the Settings switch (remembered).
 */
export function isDemoMode(): boolean {
  return (
    override ?? (process.env.EXPO_PUBLIC_DEMO === '1' || storage?.getString(STORAGE_KEY) === '1')
  );
}

/** True when the dev flag or an override decides, so the Settings switch cannot change it. */
export function isDemoModeForced(): boolean {
  return override !== undefined || process.env.EXPO_PUBLIC_DEMO === '1';
}

/** Overrides the flag; `undefined` goes back to reading it. */
export function setDemoMode(value: boolean | undefined): void {
  override = value;
  notify();
}

/** The Settings switch: remembers the choice and moves the app between live and demo. */
export function setDemoModeSetting(on: boolean): void {
  storage?.set(STORAGE_KEY, on ? '1' : '0');
  notify();
}

export function subscribeDemoMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of [...listeners]) listener();
}
