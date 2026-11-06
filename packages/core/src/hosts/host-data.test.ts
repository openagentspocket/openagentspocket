import { describe, expect, it } from 'vitest';
import { FakeClock } from './cancellation';
import { FIRST_RETRY_MS, type HostDataSource, HostDataStore, hostSystemSource } from './host-data';

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

const source: HostDataSource<number> = {
  key: 'n',
  script: 'echo 1',
  parse: (output) => {
    const value = Number(output);
    if (Number.isNaN(value)) throw new Error('not a number');
    return value;
  },
  refreshMs: 1_000,
};

function setup(outputs: (string | Error)[]) {
  const clock = new FakeClock();
  let calls = 0;
  const run = async () => {
    calls += 1;
    const next = outputs.shift() ?? '0';
    if (next instanceof Error) throw next;
    return next;
  };
  return { clock, store: new HostDataStore({ source, run, clock }), calls: () => calls };
}

describe('HostDataStore', () => {
  it('reads on start and again each period while watched', async () => {
    const { clock, store, calls } = setup(['1', '2']);
    store.start();
    await flush();
    expect(store.getState()).toMatchObject({ value: 1, failure: null, isLoading: false });
    await clock.advance(1_000);
    await flush();
    expect(store.getState().value).toBe(2);
    store.stop();
    await clock.advance(10_000);
    await flush();
    expect(calls()).toBe(2);
  });

  it('a failed refresh keeps the last value and retries with backoff', async () => {
    const { clock, store, calls } = setup(['1', new Error('down'), new Error('down'), '3']);
    store.start();
    await flush();
    await clock.advance(1_000);
    await flush();
    expect(store.getState()).toMatchObject({ value: 1, failure: 'down' });
    await clock.advance(FIRST_RETRY_MS);
    await flush();
    expect(calls()).toBe(3);
    await clock.advance(FIRST_RETRY_MS);
    await flush();
    expect(calls()).toBe(3);
    await clock.advance(FIRST_RETRY_MS);
    await flush();
    expect(store.getState()).toMatchObject({ value: 3, failure: null });
  });

  it('output it cannot parse is a failure', async () => {
    const { store } = setup(['nope']);
    store.start();
    await flush();
    expect(store.getState().failure).toBe('not a number');
    store.stop();
  });
});

describe('hostSystemSource', () => {
  it('reads uname and refuses nothing', () => {
    expect(hostSystemSource.parse('Darwin arm64\n')).toBe('Darwin arm64');
    expect(() => hostSystemSource.parse('\n')).toThrow();
  });
});
