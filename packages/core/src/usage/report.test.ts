import { describe, expect, it } from 'vitest';
import vector from '../../../plugin/test-vectors/usage-v1.json';
import { claudeProgram, decodeUsageReport, UsageReportError, withClaudeLimits } from './report';

const text = JSON.stringify(vector);

function catchError(run: () => unknown): UsageReportError {
  try {
    run();
  } catch (error) {
    if (error instanceof UsageReportError) return error;
    throw error;
  }
  throw new Error('did not throw');
}

describe('decodeUsageReport', () => {
  it('reads the plugin test vector', () => {
    const report = decodeUsageReport(text);
    expect(report.programs.map((p) => p.program)).toEqual(['claude', 'codex']);
    const claude = claudeProgram(report);
    expect(claude?.tokenUsage.totals?.last30Days.tokens.total).toBe(882000);
    expect(claude?.tokenUsage.daily).toHaveLength(30);
    expect(claude?.accounts?.map((a) => a.id)).toEqual(['default', '7f3c9a2e', 'c41d07b9']);
    expect(claude?.accounts?.map((a) => a.state)).toEqual(['ok', 'ok', 'missing']);
    expect(claude?.accountSuggestions?.map((s) => s.source)).toEqual(['agent', 'home']);
    expect(report.programs[1]?.accounts).toBeNull();
  });

  it('rejects another version before reading anything else', () => {
    const error = catchError(() => decodeUsageReport('{"version":2,"junk":true}'));
    expect(error.reason).toBe('unsupportedVersion');
  });

  it('accepts the missing-runtime answer and rejects a recorded report that lacks fields', () => {
    expect(decodeUsageReport('{"version":1,"runtime":"missing"}').programs).toEqual([]);
    for (const broken of [
      '{"version":1,"runtime":"recorded"}',
      '{"version":1,"runtime":"other"}',
      'not json',
      '[]',
      JSON.stringify({ ...vector, programs: [{ program: 'claude' }] }),
    ]) {
      expect(catchError(() => decodeUsageReport(broken)).reason).toBe('invalidReport');
    }
  });

  it('keeps an unknown account state and source instead of failing', () => {
    const claude = vector.programs[0];
    const changed = {
      ...vector,
      programs: [
        {
          ...claude,
          accounts: [{ id: 'x', directory: '/d', state: 'quarantined' }],
          accountSuggestions: [{ directory: '/d', name: 'd', source: 'cloud' }],
        },
      ],
    };
    const decoded = claudeProgram(decodeUsageReport(JSON.stringify(changed)));
    expect(decoded?.accounts?.[0]?.state).toEqual({ other: 'quarantined' });
    expect(decoded?.accountSuggestions?.[0]?.source).toEqual({ other: 'cloud' });
  });

  it('replaces every Claude limit with the toggle state, accounts included, leaving Codex alone', () => {
    const report = decodeUsageReport(text);
    const hidden = withClaudeLimits(report, 'disabled', null);
    const claude = claudeProgram(hidden);
    expect(claude?.usageLimits.state).toBe('disabled');
    expect(claude?.accounts?.map((a) => a.usageLimits?.state ?? null)).toEqual([
      'disabled',
      'disabled',
      null,
    ]);
    expect(hidden.programs[1]).toBe(report.programs[1]);
  });
});
