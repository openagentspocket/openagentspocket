import { decodeUsageReport, type UsageReport } from './report';

/** Small builders for usage reports in tests (plain JSON, decoded like the plugin's output). */
const tokens = (total: number) => ({
  input: total,
  cacheRead: 0,
  cacheWrite: 0,
  output: 0,
  reasoning: 0,
  total,
});

export const summaryJson = (total: number, cost: number | null) => ({
  tokens: tokens(total),
  estimatedCostUSD: cost,
  unpricedTokens: cost === null ? total : 0,
});

export function tokenReport(
  timeZone: string,
  days: readonly (readonly [string, number, number | null])[],
  extra: { model?: string; directory?: string; limitsPercent?: number } = {},
): UsageReport {
  const sum = (pick: (d: (typeof days)[number]) => number) => days.reduce((a, d) => a + pick(d), 0);
  const costs = days.flatMap((d) => (d[2] === null ? [] : [d[2]]));
  const total = summaryJson(
    sum((d) => d[1]),
    costs.length === 0 ? null : costs.reduce((a, b) => a + b, 0),
  );
  return decodeUsageReport(
    JSON.stringify({
      version: 1,
      runtime: 'recorded',
      generatedAt: '2026-10-26T12:00:00.000Z',
      timeZone,
      refreshing: false,
      scan: { state: 'complete', skippedArchives: 0 },
      programs: [
        {
          program: 'claude',
          tokenUsage: {
            state: 'ok',
            totals: { today: total, last7Days: total, last30Days: total },
            daily: days.map(([date, count, cost]) => ({ date, ...summaryJson(count, cost) })),
            models: [{ model: extra.model ?? 'm', priced: true, ...total }],
            directories: [{ path: extra.directory ?? '/d', ...total }],
          },
          usageLimits: {
            state: 'ok',
            windows: [{ id: 'fiveHour', usedPercent: extra.limitsPercent ?? 10, expired: false }],
          },
        },
      ],
    }),
  );
}

export interface WindowSpec {
  readonly id: string;
  readonly minutes: number | null;
  readonly used: number;
  readonly resetsAt: Date;
  readonly label?: string;
}

export const windowJson = (spec: WindowSpec) => ({
  id: spec.id,
  durationMinutes: spec.minutes,
  usedPercent: spec.used,
  resetsAt: spec.resetsAt.toISOString(),
  expired: false,
  ...(spec.label ? { label: spec.label } : {}),
});

export const limitsJson = (
  observedAt: Date,
  windows: readonly WindowSpec[],
  extra: Record<string, unknown> = {},
) => ({
  state: 'ok',
  source: 'service',
  observedAt: observedAt.toISOString(),
  plan: 'max',
  windows: windows.map(windowJson),
  ...extra,
});

/** A report with Claude Code (and optionally Codex) limits only. */
export function limitsReport(options: {
  claude: unknown;
  accounts?: unknown;
  codex?: unknown;
}): UsageReport {
  const empty = { state: 'noData' };
  return decodeUsageReport(
    JSON.stringify({
      version: 1,
      runtime: 'recorded',
      generatedAt: '2026-10-31T12:00:00.000Z',
      timeZone: 'UTC',
      refreshing: false,
      scan: { state: 'complete', skippedArchives: 0 },
      programs: [
        {
          program: 'claude',
          tokenUsage: empty,
          usageLimits: options.claude,
          ...(options.accounts ? { accounts: options.accounts } : {}),
        },
        ...(options.codex
          ? [{ program: 'codex', tokenUsage: empty, usageLimits: options.codex }]
          : []),
      ],
    }),
  );
}
