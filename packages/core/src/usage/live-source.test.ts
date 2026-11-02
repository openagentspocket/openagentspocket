import { describe, expect, it } from 'vitest';
import { FakeClock } from '../hosts/cancellation';
import { MemoryStorage } from '../hosts/known-hosts';
import { pluginInstallation } from '../hosts/plugin-installation';
import { decodeAccountFile, encodeAccountFile } from './account-file';
import { FakeUsageHostPort, fakeReport } from './host-port-fake';
import { USAGE_STALE_MS } from './host-store';
import { LiveUsageSource } from './live-source';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function setup() {
  const clock = new FakeClock(settle);
  const source = new LiveUsageSource({
    clock,
    storage: new MemoryStorage(),
    timeZone: () => 'UTC',
  });
  const a = new FakeUsageHostPort();
  const b = new FakeUsageHostPort();
  source.setHosts([
    { id: 'a', name: 'Alpha', port: a },
    { id: 'b', name: 'Beta', port: b },
    { id: 'c', name: 'Gamma', port: null },
  ]);
  return { clock, source, a, b };
}

describe('LiveUsageSource', () => {
  it('reads every connected Host on refresh and reports the unconnected one as such', async () => {
    const { source, a, b } = setup();
    await source.refresh();
    expect(a.queries).toHaveLength(1);
    expect(b.queries).toHaveLength(1);
    const readings = await source.readings();
    expect(readings.map((r) => [r.id, r.state.kind, r.isConnected])).toEqual([
      ['a', 'available', true],
      ['b', 'available', true],
      ['c', 'idle', false],
    ]);
  });

  it('tells subscribers when a reading changes and when Hosts come and go', async () => {
    const { source } = setup();
    let calls = 0;
    const off = source.subscribe(() => {
      calls += 1;
    });
    await source.refresh();
    expect(calls).toBeGreaterThan(0);
    const before = calls;
    source.setHosts([]);
    expect(calls).toBeGreaterThan(before);
    expect(await source.readings()).toEqual([]);
    off();
  });

  it('a watching surface reads at once and again once a report is 15 minutes old', async () => {
    const { source, a, clock } = setup();
    const stop = source.watch();
    await settle();
    expect(a.queries).toHaveLength(1);
    await clock.advance(USAGE_STALE_MS - 60_000);
    expect(a.queries).toHaveLength(1);
    await clock.advance(60_000);
    expect(a.queries).toHaveLength(2);
    stop();
    expect(clock.pendingTimers).toBe(0);
  });

  it('a Host that regains its connection while watched is read', async () => {
    const { source, clock } = setup();
    source.watch();
    await settle();
    const c = new FakeUsageHostPort();
    source.setHosts([{ id: 'c', name: 'Gamma', port: c }]);
    await clock.advance(0);
    expect(c.queries).toHaveLength(1);
  });

  it('the Claude Code limits switch covers every Host and re-reads watched ones', async () => {
    const { source, a, b } = setup();
    expect(source.claudeLimits.enabled()).toBe(false);
    const stop = source.watch();
    await settle();
    source.claudeLimits.set(true);
    await settle();
    expect(source.claudeLimits.enabled()).toBe(true);
    expect(a.queries.at(-1)?.claudeLimits).toBe(true);
    expect(b.queries.at(-1)?.claudeLimits).toBe(true);
    stop();
  });
});

describe('LiveUsageSource accountFiles', () => {
  it('reads and replaces the Host file, then reads Usage again', async () => {
    const { source, a } = setup();
    await source.refresh();
    const file = decodeAccountFile(await source.accountFiles.read('a'));
    expect(file.accounts).toEqual([]);
    const before = a.queries.length;
    await source.accountFiles.write('a', encodeAccountFile(file));
    await settle();
    expect(a.replaced).toHaveLength(1);
    expect(a.queries.length).toBe(before + 1);
  });

  it('refuses with the plugin requirement note when the plugin is too old', async () => {
    const { source, a } = setup();
    a.plugin = pluginInstallation({ version: '0.7.0', pluginRoot: '/p' });
    await source.refresh();
    await expect(source.accountFiles.write('a', '{}')).rejects.toMatchObject({
      reason: { kind: 'pluginRequirement' },
    });
    expect(a.replaced).toEqual([]);
  });

  it('serializes writes per Host', async () => {
    const { source, a } = setup();
    a.plugin = pluginInstallation({ version: '0.12.0', pluginRoot: '/p' });
    a.script(fakeReport({ accounts: true }));
    await source.refresh();
    const order: string[] = [];
    const first = source.accountFiles.write('a', '1').then(() => order.push('1'));
    const second = source.accountFiles.write('a', '2').then(() => order.push('2'));
    await Promise.all([first, second]);
    expect(a.replaced).toEqual(['1', '2']);
    expect(order).toEqual(['1', '2']);
  });

  it('a Host without a connection cannot be written', async () => {
    const { source } = setup();
    await expect(source.accountFiles.read('c')).rejects.toThrow();
  });
});
