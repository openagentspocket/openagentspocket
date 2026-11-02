let override: boolean | undefined;

/**
 * Demo mode swaps the live connections for scripted data. It is explicit: the
 * `EXPO_PUBLIC_DEMO=1` dev flag, or `setDemoMode(true)` (tests, the gallery).
 */
export function isDemoMode(): boolean {
  return override ?? process.env.EXPO_PUBLIC_DEMO === '1';
}

/** Overrides the flag; `undefined` goes back to reading it. */
export function setDemoMode(value: boolean | undefined): void {
  override = value;
}
