/** The instant every atlas capture believes it is: 2026-11-01 12:00:00 UTC. */
export const ATLAS_NOW = Date.UTC(2026, 10, 1, 12, 0, 0);

let frozen = false;

/**
 * Pins `Date.now()` so relative times ("3m"), status clocks and usage resets render the same in
 * every capture. Dev-only (the atlas route); idempotent.
 */
export function freezeAtlasClock(): void {
  if (frozen) return;
  frozen = true;
  Date.now = () => ATLAS_NOW;
}
