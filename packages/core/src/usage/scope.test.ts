import { describe, expect, it } from 'vitest';
import vector from '../../../plugin/test-vectors/usage-v1.json';
import { renderText } from '../errors/text';
import { decodeUsageReport } from './report';
import {
  buildUsageScope,
  exclusionText,
  scopeAccounts,
  scopeDates,
  scopeDay,
  scopeDayNote,
  scopeTotal,
  sumSummaries,
} from './scope';
import { tokenReport } from './test-builders';

const available = (id: string, name: string, report = tokenReport('UTC', [])) => ({
  id,
  name,
  state: { kind: 'available', report } as const,
});

describe('buildUsageScope', () => {
  it('adds Token Usage up across Hosts by the day each Host reported', () => {
    const studio = tokenReport(
      'Asia/Shanghai',
      [
        ['2026-10-25', 100, 1.0],
        ['2026-10-26', 200, 2.0],
      ],
      { model: 'claude-opus-5-5', directory: '/src/app' },
    );
    const build = tokenReport(
      'UTC',
      [
        ['2026-10-24', 10, 0.1],
        ['2026-10-25', 20, 0.2],
      ],
      { model: 'claude-opus-5-5', directory: '/src/app' },
    );
    const scope = buildUsageScope([
      available('a', 'Studio Mac', studio),
      available('b', 'Build Box', build),
    ]);
    const claude = scope.programs[0];
    expect(scope.programs.map((p) => p.program)).toEqual(['claude']);
    expect(claude?.daily.map((d) => d.date)).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
    expect(claude?.daily.map((d) => d.tokens.total)).toEqual([10, 120, 200]);
    expect(claude?.totals.last30Days.tokens.total).toBe(330);
    expect(Math.round((claude?.totals.last30Days.estimatedCostUSD ?? 0) * 100)).toBe(330);
    expect(scopeTotal(scope, 'last30Days').tokens.total).toBe(330);
    expect(scopeDay(scope, '2026-10-25').tokens.total).toBe(120);
    expect(scopeDates(scope)).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
    // One model name is one model; one path on two Hosts is two directories.
    expect(claude?.models.map((m) => m.model)).toEqual(['claude-opus-5-5']);
    expect(claude?.models[0]?.tokens.total).toBe(330);
    expect(claude?.directories.map((d) => d.hostName).sort()).toEqual(['Build Box', 'Studio Mac']);
    expect(scopeDayNote(scope)?.args).toEqual(['Asia/Shanghai, UTC']);
  });

  it('keeps Usage Limits with their Host and notes a single time zone', () => {
    const first = tokenReport('UTC', [['2026-10-26', 1, 0.01]], { limitsPercent: 62 });
    const second = tokenReport('UTC', [['2026-10-26', 1, 0.01]], { limitsPercent: 24 });
    const scope = buildUsageScope([available('a', 'Studio', first), available('b', 'Box', second)]);
    expect(
      scope.included.map((h) => h.report.programs[0]?.usageLimits.windows[0]?.usedPercent),
    ).toEqual([62, 24]);
    expect(scopeDayNote(scope)?.key).toBe('Days shown in %@.');
  });

  it('leaves out the Hosts that cannot report, with their reason', () => {
    const report = tokenReport('UTC', [['2026-10-26', 5, null]]);
    const scope = buildUsageScope([
      available('a', 'Studio Mac', report),
      { id: 'b', name: 'Office PC', state: { kind: 'unsupportedPlatform' } },
      { id: 'c', name: 'Pi Lab', state: { kind: 'failed', detail: 'x' } },
      { id: 'd', name: 'Mini', state: { kind: 'loading' } },
      { id: 'e', name: 'Lab', state: { kind: 'loading' }, isConnected: false },
    ]);
    expect(scope.excluded.map((e) => e.name)).toEqual(['Office PC', 'Pi Lab', 'Lab']);
    expect(scope.excluded.map((e) => renderText(exclusionText(e.exclusion)))).toEqual([
      'Not supported on Windows',
      'Could not read Usage',
      'Not connected',
    ]);
    expect(scope.loading.map((h) => h.name)).toEqual(['Mini']);
    // Unpriced throughout stays unpriced instead of reading $0.00.
    expect(scopeTotal(scope, 'last30Days').estimatedCostUSD).toBeNull();
    expect(scopeTotal(scope, 'last30Days').unpricedTokens).toBe(5);
  });

  it('lists the readable Accounts of a lone Host with several, unreadable ones skipped', () => {
    const report = decodeUsageReport(JSON.stringify(vector));
    const scope = buildUsageScope([available('a', 'Devbox', report)]);
    const accounts = scopeAccounts(scope, 'claude', 'last30Days');
    expect(accounts.map((a) => a.id)).toEqual(['default', '7f3c9a2e']);
    expect(accounts[0]?.summary?.tokens.total).toBe(882000);
    // noData reads as zero, not as unreadable.
    expect(accounts[1]?.summary?.tokens.total).toBe(0);
    const two = buildUsageScope([available('a', 'Devbox', report), available('b', 'Box', report)]);
    expect(scopeAccounts(two, 'claude', 'last30Days')).toEqual([]);
  });
});

describe('sumSummaries', () => {
  it('sums priced figures and counts unpriced tokens separately', () => {
    const priced = {
      tokens: tokenReport('UTC', [['2026-10-26', 3, 1]]).programs[0]?.tokenUsage.daily[0]?.tokens,
    };
    expect(priced.tokens?.total).toBe(3);
    const a = {
      tokens: { input: 1, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, total: 1 },
      estimatedCostUSD: 1,
      unpricedTokens: 0,
    };
    const b = { ...a, estimatedCostUSD: null, unpricedTokens: 1 };
    expect(sumSummaries([a, b])).toMatchObject({ estimatedCostUSD: 1, unpricedTokens: 1 });
    expect(sumSummaries([b]).estimatedCostUSD).toBeNull();
    expect(sumSummaries([]).estimatedCostUSD).toBe(0);
  });
});
