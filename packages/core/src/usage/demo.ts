import { decodeUsageReport, type UsageReport } from './report';
import type { HostReading } from './scope';

/** What the Usage screens read until the live per-Host store lands. */
export interface UsageSource {
  readings(): Promise<HostReading[]>;
  /** Live sources only: tells when a reading changed. */
  subscribe?(listener: () => void): () => void;
  /** Live sources only: a pull to refresh reads every connected Host once. */
  refresh?(): Promise<void>;
  /** Live sources only: a visible surface starts polling; the returned function stops it. */
  watch?(): () => void;
  /** Live sources only: the device's Claude Code limits consent. */
  claudeLimits?: {
    enabled(): boolean;
    set(enabled: boolean): void;
  };
}

/** Where a Host's `usage-accounts.json` lives; the live one runs over SSH exec / SFTP. */
export interface AccountFileStore {
  read(hostId: string): Promise<string | null>;
  write(hostId: string, text: string): Promise<void>;
}

export class MemoryAccountFileStore implements AccountFileStore {
  private readonly files = new Map<string, string>();

  async read(hostId: string): Promise<string | null> {
    return this.files.get(hostId) ?? null;
  }

  async write(hostId: string, text: string): Promise<void> {
    this.files.set(hostId, text);
  }
}

const tokens = (total: number) => ({
  input: Math.round(total * 0.01),
  cacheRead: Math.round(total * 0.9),
  cacheWrite: Math.round(total * 0.05),
  output: Math.round(total * 0.04),
  reasoning: 0,
  total,
});
const summary = (total: number) => ({
  tokens: tokens(total),
  estimatedCostUSD: Math.round(total * 0.0000011 * 100) / 100,
  unpricedTokens: 0,
});

function isoDay(now: Date, back: number): string {
  return new Date(now.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}

function claudeTokenUsage(now: Date, scale: number) {
  const daily = Array.from({ length: 30 }, (_, i) => {
    const total = Math.round(scale * (i % 7 === 0 ? 0 : 400_000 + ((i * 7919) % 900_000)));
    return { date: isoDay(now, 29 - i), ...summary(total) };
  });
  const sum = (n: number) => daily.slice(-n).reduce((a, d) => a + d.tokens.total, 0);
  return {
    state: 'ok',
    totals: { today: summary(sum(1)), last7Days: summary(sum(7)), last30Days: summary(sum(30)) },
    daily,
    models: [
      { model: 'claude-opus-4-5', priced: true, ...summary(Math.round(sum(30) * 0.7)) },
      { model: 'claude-sonnet-4-5', priced: true, ...summary(Math.round(sum(30) * 0.3)) },
    ],
    directories: [{ path: '/work/project', ...summary(sum(30)) }],
  };
}

function windows(now: Date, fiveHour: number, week: number) {
  const reset = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString();
  return [
    {
      id: 'fiveHour',
      durationMinutes: 300,
      usedPercent: fiveHour,
      resetsAt: reset(2.25),
      expired: false,
    },
    {
      id: 'sevenDay',
      durationMinutes: 10_080,
      usedPercent: week,
      resetsAt: reset(72),
      expired: false,
    },
    {
      id: 'sevenDayOpus',
      durationMinutes: 10_080,
      usedPercent: 96,
      resetsAt: reset(72),
      expired: false,
    },
  ];
}

/** A recorded report with two Claude Code Accounts (plus one missing) and Codex. */
export function demoUsageReport(now: Date = new Date()): UsageReport {
  const observedAt = new Date(now.getTime() - 30_000).toISOString();
  const limits = (fiveHour: number, week: number) => ({
    state: 'ok',
    source: 'service',
    observedAt,
    plan: 'max',
    windows: windows(now, fiveHour, week),
  });
  const text = JSON.stringify({
    version: 1,
    pricingVersion: '2026-10-23',
    generatedAt: now.toISOString(),
    timeZone: 'UTC',
    runtime: 'recorded',
    refreshing: false,
    scan: {
      state: 'complete',
      coveredFrom: isoDay(now, 29),
      coveredThrough: now.toISOString(),
      skippedArchives: 0,
      unreadableFiles: 0,
    },
    programs: [
      {
        program: 'claude',
        tokenUsage: claudeTokenUsage(now, 1),
        usageLimits: limits(58, 38),
        accounts: [
          {
            id: 'default',
            isDefault: true,
            name: null,
            directory: '/home/dev/.claude',
            state: 'ok',
            tokenUsage: claudeTokenUsage(now, 0.6),
            usageLimits: limits(58, 38),
          },
          {
            id: '7f3c9a2e',
            isDefault: false,
            name: 'work',
            directory: '/home/dev/.claude-work',
            state: 'ok',
            tokenUsage: claudeTokenUsage(now, 0.4),
            usageLimits: limits(81, 52),
          },
          {
            id: 'c41d07b9',
            isDefault: false,
            name: 'old',
            directory: '/home/dev/.claude-old',
            state: 'missing',
          },
        ],
        accountSuggestions: [
          { directory: '/home/dev/.claude-personal', name: 'claude-personal', source: 'home' },
        ],
      },
      {
        program: 'codex',
        tokenUsage: {
          ...claudeTokenUsage(now, 0.1),
          models: [{ model: 'gpt-5.3-codex', priced: true, ...summary(250_000) }],
        },
        usageLimits: {
          state: 'ok',
          source: 'lastSession',
          observedAt,
          plan: 'plus',
          windows: [windows(now, 20, 18)[1]],
        },
      },
    ],
  });
  return decodeUsageReport(text);
}

/** Offline stand-in for the live store: one demo Host that answers, one that is not connected. */
export class FakeUsageSource implements UsageSource {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async readings(): Promise<HostReading[]> {
    return [
      {
        id: 'demo',
        name: 'Demo Host',
        state: { kind: 'available', report: demoUsageReport(this.now()) },
      },
      { id: 'offline', name: 'Spare Host', state: { kind: 'idle' }, isConnected: false },
    ];
  }
}
