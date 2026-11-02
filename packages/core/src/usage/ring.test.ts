import { describe, expect, it } from 'vitest';
import { highestRunningPercent } from './ring';
import type { HostReading } from './scope';
import { limitsReport } from './test-builders';

const NOW = new Date('2026-10-30T12:00:00Z');
const win = (id: string, used: number, extra: Record<string, unknown> = {}) => ({
  id,
  usedPercent: used,
  expired: false,
  ...extra,
});
const reading = (report: ReturnType<typeof limitsReport>): HostReading => ({
  id: 'h',
  name: 'h',
  state: { kind: 'available', report },
});
const ok = (windows: unknown[]) => ({ state: 'ok', windows });

describe('highestRunningPercent', () => {
  it('takes the fullest window still running', () => {
    const report = limitsReport({
      claude: ok([
        win('5h', 34, { resetsAt: '2026-10-31T00:00:00Z' }),
        win('7d', 61),
        win('old', 99, { resetsAt: '2026-10-29T00:00:00Z' }),
        win('gone', 97, { expired: true }),
      ]),
    });
    expect(highestRunningPercent([reading(report)], NOW)).toBe(61);
  });

  it('reads readable Accounts and skips unreadable ones', () => {
    const report = limitsReport({
      claude: ok([win('5h', 10)]),
      accounts: [
        { id: 'work', directory: '~/w', state: 'ok', usageLimits: ok([win('5h', 88)]) },
        { id: 'old', directory: '~/o', state: 'missing', usageLimits: ok([win('5h', 99)]) },
      ],
    });
    expect(highestRunningPercent([reading(report)], NOW)).toBe(88);
  });

  it('is null with nothing to show and ignores Hosts without a report', () => {
    expect(highestRunningPercent([], NOW)).toBeNull();
    expect(highestRunningPercent([reading(limitsReport({ claude: ok([]) }))], NOW)).toBeNull();
    expect(
      highestRunningPercent([{ id: 'x', name: 'x', state: { kind: 'loading' } }], NOW),
    ).toBeNull();
  });

  it('skips disabled limits and clamps to 0-100', () => {
    const off = limitsReport({ claude: { state: 'disabled', windows: [win('5h', 90)] } });
    expect(highestRunningPercent([reading(off)], NOW)).toBeNull();
    const over = limitsReport({ claude: ok([win('5h', 130)]) });
    expect(highestRunningPercent([reading(over)], NOW)).toBe(100);
  });
});
