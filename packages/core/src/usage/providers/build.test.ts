import { describe, expect, it } from 'vitest';
import { renderText } from '../../errors/text';
import { decodeUsageReport } from '../report';
import type { HostReading } from '../scope';
import { limitsJson, limitsReport } from '../test-builders';
import { providerUsage } from './build';
import { registerUsageProvider, usageProvider, usageProviders } from './registry';
import { updatedMessage } from './updated';

const NOW = new Date('2026-10-31T12:00:00Z');
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);
const translate = (key: string, args: readonly string[]) =>
  args.reduce((text, arg) => text.replace(/%lld|%@/, arg), key);
const host = (report: ReturnType<typeof limitsReport>): HostReading => ({
  id: 'h1',
  name: 'devbox',
  state: { kind: 'available', report },
});

describe('providerUsage', () => {
  it('builds one entry per registered provider with normalized windows', () => {
    const report = limitsReport({
      claude: limitsJson(NOW, [
        { id: 'sevenDay', minutes: 10_080, used: 62, resetsAt: at(86_400) },
      ]),
      codex: limitsJson(NOW, [
        { id: 'primary', minutes: 300, used: 7, resetsAt: at(3_600) },
        { id: 'secondary', minutes: 10_080, used: 4, resetsAt: at(86_400) },
      ]),
    });
    const [claude, codex] = providerUsage([host(report)], NOW, translate);
    expect(claude?.provider.id).toBe('claude');
    expect(claude?.state).toBe('ok');
    expect(claude?.windows.map((w) => [w.label, w.usedShare])).toEqual([['Weekly', 0.62]]);
    expect(codex?.provider.brand).toBe('openai');
    expect(codex?.windows.map((w) => w.label)).toEqual(['5-hour', 'Weekly']);
    expect(codex?.windows[0]?.resetsAt).toEqual(at(3_600));
    expect(codex?.hostId).toBe('h1');
  });

  it('shows a program the plugin reports once its provider is registered', () => {
    const report = decodeUsageReport(
      JSON.stringify({
        version: 1,
        runtime: 'recorded',
        generatedAt: NOW.toISOString(),
        timeZone: 'UTC',
        refreshing: false,
        scan: { state: 'complete', skippedArchives: 0 },
        programs: [
          {
            program: 'hermes',
            tokenUsage: { state: 'unavailable' },
            usageLimits: limitsJson(NOW, [
              { id: 'monthly', minutes: null, used: 30, resetsAt: at(1_000), label: 'Credits' },
            ]),
          },
          {
            program: 'unknown-tool',
            tokenUsage: { state: 'unavailable' },
            usageLimits: limitsJson(NOW, [{ id: 'x', minutes: 60, used: 1, resetsAt: at(10) }]),
          },
        ],
      }),
    );
    const entries = providerUsage([host(report)], NOW, translate);
    expect(entries.map((e) => e.provider.id)).toEqual(['hermes']);
    expect(entries[0]?.windows[0]?.label).toBe('Credits');
  });

  it('adds a provider with one registration', () => {
    registerUsageProvider({ id: 'demo-tool', displayName: 'Demo', brand: null });
    expect(usageProvider('demo-tool')?.displayName).toBe('Demo');
    expect(usageProviders().at(-1)?.id).toBe('demo-tool');
  });

  it('reports Claude Code limits that are off as off', () => {
    const report = limitsReport({ claude: { state: 'disabled' } });
    const [claude] = providerUsage([host(report)], NOW, translate);
    expect(claude?.state).toBe('off');
    expect(claude?.windows).toEqual([]);
  });
});

it('reports a disabled non-Claude provider as off, not as an error', () => {
  const report = decodeUsageReport(
    JSON.stringify({
      version: 1,
      runtime: 'recorded',
      generatedAt: NOW.toISOString(),
      timeZone: 'UTC',
      refreshing: false,
      scan: { state: 'complete', skippedArchives: 0 },
      programs: [
        {
          program: 'hermes',
          tokenUsage: { state: 'unavailable' },
          usageLimits: { state: 'disabled' },
        },
      ],
    }),
  );
  const [hermes] = providerUsage([host(report)], NOW, translate);
  expect(hermes?.state).toBe('off');
});

describe('updatedMessage', () => {
  it('reads this minute, then the age', () => {
    expect(renderText(updatedMessage(at(-30), NOW, 'en'))).toContain('this minute');
    expect(renderText(updatedMessage(at(-600), NOW, 'en'))).toContain('Updated');
  });
});
