// One formatter for every duration the app words: "2m 18s" on a row, "2 minutes, 18 seconds" for a
// screen reader (Swift `Duration.formatted(.units(..., maximumUnitCount: 2))`, narrow and wide).

import { message, type Text } from '../errors/text';

export type DurationWidth = 'narrow' | 'wide';

/** The largest two non-zero units of whole seconds (hours, minutes, seconds); "0s" for none. */
function units(seconds: number): { hours: number; minutes: number; seconds: number } {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return {
    hours: Math.floor(whole / 3600),
    minutes: Math.floor((whole % 3600) / 60),
    seconds: whole % 60,
  };
}

/**
 * "38s", "2m 18s", "1h 5m" (narrow); "1 hour, 5 minutes" (wide, from the catalog's plural keys).
 * Negative and non-finite spans read as zero.
 */
export function formatDuration(seconds: number, width?: 'narrow'): string;
export function formatDuration(seconds: number, width: 'wide'): Text;
export function formatDuration(seconds: number, width: DurationWidth = 'narrow'): Text {
  const { hours, minutes, seconds: rest } = units(seconds);
  const parts: { count: number; short: string; key: string }[] = [
    { count: hours, short: 'h', key: '%lld hours' },
    { count: minutes, short: 'm', key: '%lld minutes' },
    { count: rest, short: 's', key: '%lld seconds' },
  ];
  const shown = parts.filter((part) => part.count > 0).slice(0, 2);
  if (shown.length === 0) shown.push({ count: 0, short: 's', key: '%lld seconds' });
  if (width === 'narrow') return shown.map((part) => `${part.count}${part.short}`).join(' ');
  return { join: shown.map((part) => message(part.key, String(part.count))), separator: ', ' };
}
