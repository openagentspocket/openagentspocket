import { describe, expect, it } from 'vitest';
import { demoUsageReport } from './demo';
import { MemoryWidgetPort, WidgetPublisher } from './widget-publisher';
import { WIDGET_KINDS } from './widget-snapshot';

const NOW = new Date('2026-11-02T12:00:00Z');
const readings = [
  { id: 'demo', name: 'Demo', state: { kind: 'available', report: demoUsageReport(NOW) } },
] as const;

describe('WidgetPublisher', () => {
  it('writes once and reloads the widget kinds, then skips an unchanged reading', async () => {
    const port = new MemoryWidgetPort();
    const publisher = new WidgetPublisher(port);
    expect(await publisher.publish(readings, NOW)).toBe(true);
    expect(await publisher.publish(readings, new Date(NOW.getTime() + 1000))).toBe(false);
    expect(port.written).toHaveLength(1);
    expect(port.reloads).toEqual([WIDGET_KINDS]);
  });

  it('writes again when a Host is renamed', async () => {
    const port = new MemoryWidgetPort();
    const publisher = new WidgetPublisher(port);
    await publisher.publish(readings, NOW);
    expect(await publisher.publish([{ ...readings[0], name: 'Other' }], NOW)).toBe(true);
    expect(port.written).toHaveLength(2);
  });

  it('does nothing while the container is unavailable', async () => {
    const port = new MemoryWidgetPort(false);
    const publisher = new WidgetPublisher(port);
    expect(await publisher.publish(readings, NOW)).toBe(false);
    expect(port.reloads).toEqual([]);
    expect(publisher.current).toBeNull();
  });
});
