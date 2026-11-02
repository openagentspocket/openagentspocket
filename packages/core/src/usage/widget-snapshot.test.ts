import { describe, expect, it } from 'vitest';
import { demoUsageReport } from './demo';
import {
  buildWidgetSnapshot,
  encodeWidgetSnapshot,
  WIDGET_SNAPSHOT_VERSION,
  widgetHostId,
} from './widget-snapshot';

const NOW = new Date('2026-11-02T12:00:00Z');
const UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
const demo = {
  id: 'demo',
  name: 'Demo Host',
  state: { kind: 'available', report: demoUsageReport(NOW) },
} as const;

describe('widgetHostId', () => {
  it('keeps a UUID, upper-cased, and derives a stable valid one otherwise', () => {
    expect(widgetHostId('0b5a8f3c-1111-4222-8333-444455556666')).toBe(
      '0B5A8F3C-1111-4222-8333-444455556666',
    );
    expect(widgetHostId('demo')).toMatch(UUID);
    expect(widgetHostId('demo')).toBe(widgetHostId('demo'));
    expect(widgetHostId('demo')).not.toBe(widgetHostId('other'));
  });
});

describe('buildWidgetSnapshot', () => {
  it('reports programs and limits for a Host that answered and lists the others with a code', () => {
    const snapshot = buildWidgetSnapshot(
      [demo, { id: 'off', name: 'Spare', state: { kind: 'idle' }, isConnected: false }],
      { now: NOW },
    );
    expect(snapshot.version).toBe(WIDGET_SNAPSHOT_VERSION);
    const [first, second] = snapshot.hosts;
    expect(first?.readAt).toEqual(NOW);
    expect(first?.programs.map((p) => p.program)).toEqual(['claude', 'codex']);
    expect(first?.limits.length).toBeGreaterThan(2);
    expect(second?.excludedCode).toBe('notConnected');
    expect(second?.programs).toEqual([]);
  });

  it('keeps the last report of a Host it cannot read now', () => {
    const first = buildWidgetSnapshot([demo], { now: NOW });
    const next = buildWidgetSnapshot([{ ...demo, name: 'Renamed', state: { kind: 'idle' } }], {
      previous: first,
      now: new Date(NOW.getTime() + 60_000),
    });
    expect(next.hosts[0]?.name).toBe('Renamed');
    expect(next.hosts[0]?.readAt).toEqual(NOW);
    expect(next.hosts[0]?.programs.length).toBe(2);
  });

  it('drops the figures of a Host that answered it cannot report', () => {
    const first = buildWidgetSnapshot([demo], { now: NOW });
    const next = buildWidgetSnapshot([{ ...demo, state: { kind: 'requirement' } }], {
      previous: first,
      now: NOW,
    });
    expect(next.hosts[0]?.excludedCode).toBe('needsPlugin');
  });
});

describe('encodeWidgetSnapshot', () => {
  it('writes dates as seconds since 2001 and omits nulls, as Swift decodes them', () => {
    const text = encodeWidgetSnapshot(buildWidgetSnapshot([demo], { now: NOW }));
    const parsed: { hosts: { readAt: number; limits: unknown[] }[] } = JSON.parse(text);
    const host = parsed.hosts[0];
    expect(host?.readAt).toBe((NOW.getTime() - Date.UTC(2001, 0, 1)) / 1000);
    expect(host).not.toHaveProperty('excludedReason');
    expect(text).not.toContain('null');
  });
});
