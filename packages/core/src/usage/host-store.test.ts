import { describe, expect, it } from 'vitest';
import { TransportFailure } from '../errors';
import { FakeClock } from '../hosts/cancellation';
import { MemoryStorage } from '../hosts/known-hosts';
import { pluginInstallation } from '../hosts/plugin-installation';
import { FakeUsageHostPort, fakeReport } from './host-port-fake';
import { claudeLimitsKey, USAGE_MAX_RETRY_MS, USAGE_POLL_MS, UsageHostStore } from './host-store';
import { UsageReportError } from './report';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function setup(port = new FakeUsageHostPort(), storage = new MemoryStorage()) {
  const clock = new FakeClock(settle);
  const store = new UsageHostStore({ hostId: 'h1', clock, storage, timeZone: () => 'UTC' });
  store.setPort(port);
  return { port, clock, store, storage };
}

const kind = (store: UsageHostStore) => store.getSnapshot().state.kind;

describe('UsageHostStore reading', () => {
  it('reads the report the plugin query resolved', async () => {
    const { store, port } = setup();
    await store.refresh();
    expect(kind(store)).toBe('available');
    expect(port.queries).toEqual([
      { pluginRoot: '/plugins/agentico', timeZone: 'UTC', claudeLimits: false },
    ]);
  });

  it.each([
    ['no plugin', null],
    ['unparseable version', pluginInstallation({ version: 'dev' })],
    ['too old', pluginInstallation({ version: '0.6.0', pluginRoot: '/p' })],
    ['disabled', pluginInstallation({ version: '0.12.0', pluginRoot: '/p', isEnabled: false })],
    ['no install path', pluginInstallation({ version: '0.12.0' })],
  ])('gates the query on the plugin: %s', async (_name, plugin) => {
    const { store, port } = setup();
    port.plugin = plugin;
    await store.refresh();
    expect(port.queries).toEqual([]);
    expect(store.getSnapshot().state).toMatchObject({ kind: 'requirement' });
  });

  it('maps a missing runtime and a newer report format', async () => {
    const { store, port } = setup();
    port.script(new UsageReportError('unsupportedVersion'));
    await store.refresh();
    expect(kind(store)).toBe('updateRequired');
    const missing = fakeReport();
    port.script({ ...missing, runtime: 'missing' });
    await store.refresh();
    expect(kind(store)).toBe('runtimeMissing');
  });

  it('maps transport failures to unsupported, timeout and plain failures', async () => {
    const { store, port } = setup();
    port.script(new TransportFailure({ kind: 'hostFeatureUnavailable', feature: 'x' }));
    await store.refresh();
    expect(kind(store)).toBe('unsupportedPlatform');
    port.script(new TransportFailure({ kind: 'hostFileTimedOut' }));
    await store.refresh();
    expect(kind(store)).toBe('failed');
  });

  it('a Host without a connection fails its read instead of throwing', async () => {
    const { store } = setup();
    store.setPort(null);
    await store.refresh();
    expect(kind(store)).toBe('failed');
  });
});

describe('UsageHostStore polling and backoff', () => {
  it('polls every 3 s while the worker refreshes and stops when it is done', async () => {
    const { store, port, clock } = setup(
      new FakeUsageHostPort([fakeReport({ refreshing: true }), fakeReport()]),
    );
    const done = store.refresh();
    await settle();
    expect(port.queries).toHaveLength(1);
    await clock.advance(USAGE_POLL_MS - 1);
    expect(port.queries).toHaveLength(1);
    await clock.advance(1);
    await done;
    expect(port.queries).toHaveLength(2);
    expect(clock.pendingTimers).toBe(0);
  });

  it('keeps the shown report when a refresh fails and doubles the retry up to 30 s', async () => {
    const down = new Error('down');
    const { store, port, clock } = setup(
      new FakeUsageHostPort([fakeReport({ refreshing: true }), down]),
    );
    const loop = store.refresh();
    await settle();
    const waits: number[] = [];
    let last = clock.now;
    for (let i = 0; i < 7; i += 1) {
      const before = port.queries.length;
      while (port.queries.length === before) {
        await clock.advance(1_000);
      }
      waits.push(clock.now - last);
      last = clock.now;
      if (i === 0) {
        expect(kind(store)).toBe('available');
        expect(store.getSnapshot().refreshFailure).not.toBeNull();
      }
    }
    expect(waits.slice(0, 3)).toEqual([3_000, 3_000, 6_000]);
    expect(Math.max(...waits)).toBe(USAGE_MAX_RETRY_MS);
    expect(store.getSnapshot().isRetryingRefresh).toBe(true);
    store.stop();
    await loop;
    expect(clock.pendingTimers).toBe(0);
  });

  it('a recovered connection retries a failed refresh at once', async () => {
    const { store, port, clock } = setup(
      new FakeUsageHostPort([fakeReport({ refreshing: true }), new Error('down'), fakeReport()]),
    );
    const loop = store.refresh();
    await settle();
    await clock.advance(USAGE_POLL_MS);
    expect(store.getSnapshot().refreshFailure).not.toBeNull();
    store.connectionBecameUsable();
    await loop;
    expect(port.queries).toHaveLength(3);
    expect(store.getSnapshot().refreshFailure).toBeNull();
  });

  it('refreshIfStale reads when nothing was read and after 15 minutes only', async () => {
    const { store, port, clock } = setup();
    await store.refreshIfStale();
    expect(port.queries).toHaveLength(1);
    await store.refreshIfStale();
    expect(port.queries).toHaveLength(1);
    await clock.advance(15 * 60_000);
    await store.refreshIfStale();
    expect(port.queries).toHaveLength(2);
  });
});

describe('UsageHostStore Claude Code limits consent', () => {
  const windowsOf = (store: UsageHostStore) => {
    const state = store.getSnapshot().state;
    if (state.kind !== 'available') throw new Error('not available');
    return state.report.programs[0]?.usageLimits;
  };

  it('is off by default, hides any cached reading, and is asked of the plugin only when on', async () => {
    const { store, port } = setup();
    await store.refresh();
    expect(windowsOf(store)?.state).toBe('disabled');
    expect(windowsOf(store)?.windows).toEqual([]);
    expect(port.queries[0]?.claudeLimits).toBe(false);
  });

  it('persists per Host, reads not-yet-read until the re-query lands, and passes the flag', async () => {
    const { store, port, storage } = setup();
    await store.refresh();
    store.setClaudeLimits(true);
    expect(storage.getString(claudeLimitsKey('h1'))).toBe('true');
    expect(windowsOf(store)).toMatchObject({ state: 'unavailable', reason: 'notReadYet' });
    await store.refresh();
    expect(port.queries.at(-1)?.claudeLimits).toBe(true);
    expect(windowsOf(store)?.state).toBe('ok');
    const again = new UsageHostStore({ hostId: 'h1', clock: new FakeClock(), storage });
    expect(again.claudeLimitsEnabled).toBe(true);
    expect(
      new UsageHostStore({ hostId: 'h2', clock: new FakeClock(), storage }).claudeLimitsEnabled,
    ).toBe(false);
  });

  it('a failed re-query after turning it on reads as failed, not as still reading', async () => {
    const { store, port } = setup();
    await store.refresh();
    store.setClaudeLimits(true);
    port.script(new Error('down'));
    await store.refresh();
    expect(windowsOf(store)).toMatchObject({ state: 'error', reason: 'requestFailed' });
  });
});

describe('UsageHostStore Accounts support', () => {
  it('follows the plugin release, and the report before a release is known', async () => {
    const { store, port } = setup();
    port.plugin = pluginInstallation({ version: '0.7.0', pluginRoot: '/p' });
    await store.refresh();
    expect(store.supportsClaudeAccounts).toBe(false);
    expect(store.claudeAccountsRequirement).not.toBeNull();
    port.plugin = pluginInstallation({ version: '0.8.0', pluginRoot: '/p' });
    await store.refresh();
    expect(store.supportsClaudeAccounts).toBe(true);
    expect(store.claudeAccountsRequirement).toBeNull();
  });
});
