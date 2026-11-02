import { parseInstant } from './limits';
import { isReadableAccount, type UsageLimits } from './report';
import type { HostReading } from './scope';

/**
 * What Home's Usage ring shows: the fullest Usage Limit window still running, 0-100, from the
 * readings the app already holds (Claude Code, Codex and readable Claude Code Accounts). null when
 * no reading carries a running window with a figure. It never reads a Host on its own.
 */
export function highestRunningPercent(readings: readonly HostReading[], now: Date): number | null {
  let highest: number | null = null;
  for (const reading of readings) {
    if (reading.state.kind !== 'available') continue;
    for (const program of reading.state.report.programs) {
      const accounts = (program.accounts ?? [])
        .filter(isReadableAccount)
        .flatMap((a) => (a.usageLimits ? [a.usageLimits] : []));
      for (const limits of [program.usageLimits, ...accounts]) {
        for (const percent of runningPercents(limits, now)) {
          highest = highest === null ? percent : Math.max(highest, percent);
        }
      }
    }
  }
  return highest === null ? null : Math.min(Math.max(highest, 0), 100);
}

function runningPercents(limits: UsageLimits, now: Date): number[] {
  if (limits.state !== 'ok' && limits.state !== 'throttled') return [];
  return limits.windows.flatMap((window) => {
    if (window.expired || window.usedPercent === null) return [];
    const reset = parseInstant(window.resetsAt);
    return reset !== null && reset <= now ? [] : [window.usedPercent];
  });
}
