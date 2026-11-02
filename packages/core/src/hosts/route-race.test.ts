import { describe, expect, it } from 'vitest';
import {
  CancelledError,
  type CancelSignal,
  createCancellation,
  FakeClock,
  flushMicrotasks,
} from './cancellation';
import { RouteRaceFailure, raceFirst, raceRoutes } from './route-race';
import type { SSHRoute } from './ssh-route';
import { HostKeyVerificationGate } from './verification-gate';

class Refused extends Error {
  constructor(readonly index: number) {
    super(`refused ${index}`);
  }
}

/** Records which attempts started, and lets a test settle each one. */
class Script {
  readonly started: number[] = [];
  readonly cancelled: number[] = [];
  private readonly settle = new Map<number, (result: string | Refused) => void>();

  run = (index: number, signal: CancelSignal): Promise<string> => {
    this.started.push(index);
    signal.addEventListener('abort', () => this.cancelled.push(index), { once: true });
    return new Promise((resolve, reject) => {
      this.settle.set(index, (result) =>
        result instanceof Refused ? reject(result) : resolve(result),
      );
    });
  };

  async finish(index: number, result: string | Refused): Promise<void> {
    this.settle.get(index)?.(result);
    await flushMicrotasks();
  }
}

function race(script: Script, clock: FakeClock, isDeferred: (i: number) => boolean, count = 2) {
  const discarded: string[] = [];
  const promise = raceFirst({
    count,
    isDeferred,
    attempt: script.run,
    discard: (value) => {
      discarded.push(value);
    },
    clock,
  });
  promise.catch(() => undefined);
  return { promise, discarded };
}

describe('route race', () => {
  it('a direct winner never starts the deferred routes', async () => {
    const script = new Script();
    const clock = new FakeClock();
    const { promise } = race(script, clock, (i) => i === 1);

    await script.finish(0, 'lan');

    expect(await promise).toEqual({ index: 0, value: 'lan' });
    await clock.advance(10_000);
    expect(script.started).toEqual([0]);
    expect(clock.pendingTimers).toBe(0);
  });

  it('starts deferred routes once every direct route failed, without waiting', async () => {
    const script = new Script();
    const clock = new FakeClock();
    const { promise } = race(script, clock, (i) => i === 1);

    await script.finish(0, new Refused(0));
    expect(script.started).toEqual([0, 1]);
    expect(clock.now).toBe(0);
    await script.finish(1, 'jump');

    expect(await promise).toEqual({ index: 1, value: 'jump' });
  });

  it('starts deferred routes after the 400 ms stagger while a direct route hangs', async () => {
    const script = new Script();
    const clock = new FakeClock();
    const { promise, discarded } = race(script, clock, (i) => i === 1);

    await clock.advance(399);
    expect(script.started).toEqual([0]);
    await clock.advance(1);
    expect(script.started).toEqual([0, 1]);

    await script.finish(1, 'jump');
    expect(await promise).toEqual({ index: 1, value: 'jump' });
    expect(script.cancelled).toEqual([0]);

    // The hanging route answers late: its connection is discarded.
    await script.finish(0, 'late lan');
    expect(discarded).toEqual(['late lan']);
  });

  it('honors a custom stagger', async () => {
    const script = new Script();
    const clock = new FakeClock();
    raceFirst({
      count: 2,
      isDeferred: (i) => i === 1,
      staggerMs: 50,
      attempt: script.run,
      discard: () => undefined,
      clock,
    }).catch(() => undefined);

    await clock.advance(50);
    expect(script.started).toEqual([0, 1]);
  });

  it('starts every route at once when none is direct', async () => {
    const script = new Script();
    const clock = new FakeClock();
    const { promise } = race(script, clock, () => false);

    expect(script.started).toEqual([0, 1]);
    await script.finish(1, 'jump');
    expect((await promise).index).toBe(1);
    expect(script.cancelled).toEqual([0]);
  });

  it('starts deferred routes at once when every route is deferred', async () => {
    const script = new Script();
    race(script, new FakeClock(), () => true);
    expect(script.started).toEqual([0, 1]);
  });

  it('reports every failure in route order', async () => {
    const script = new Script();
    const clock = new FakeClock();
    const { promise } = race(script, clock, (i) => i === 2, 3);

    await script.finish(1, new Refused(1));
    await script.finish(0, new Refused(0));
    await script.finish(2, new Refused(2));

    const failure = await promise.then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(RouteRaceFailure);
    expect((failure as RouteRaceFailure).failures.map((e) => (e as Refused).index)).toEqual([
      0, 1, 2,
    ]);
  });

  it('fails at once with no routes', async () => {
    const result = raceFirst({
      count: 0,
      isDeferred: () => false,
      attempt: async () => 'x',
      discard: () => undefined,
      clock: new FakeClock(),
    });
    await expect(result).rejects.toEqual(new RouteRaceFailure([]));
  });

  it('cancelling the caller cancels the race and discards a late success', async () => {
    const script = new Script();
    const clock = new FakeClock();
    const caller = createCancellation();
    const discarded: string[] = [];
    const promise = raceFirst({
      count: 2,
      isDeferred: (i) => i === 1,
      attempt: script.run,
      discard: (value) => {
        discarded.push(value);
      },
      clock,
      signal: caller.signal,
    });

    caller.cancel();

    await expect(promise).rejects.toBeInstanceOf(CancelledError);
    expect(script.cancelled).toEqual([0]);
    expect(clock.pendingTimers).toBe(0);
    await script.finish(0, 'too late');
    expect(discarded).toEqual(['too late']);
  });

  it('never starts when the caller already cancelled', async () => {
    const script = new Script();
    const caller = createCancellation();
    caller.cancel();
    const promise = raceFirst({
      count: 1,
      isDeferred: () => false,
      attempt: script.run,
      discard: () => undefined,
      clock: new FakeClock(),
      signal: caller.signal,
    });
    await expect(promise).rejects.toBeInstanceOf(CancelledError);
    expect(script.started).toEqual([]);
  });

  it('defers Jump Host routes only while a direct route exists', async () => {
    const direct: SSHRoute = { host: '192.168.1.5', port: 22, jump: null, id: 'a' };
    const viaJump: SSHRoute = {
      host: '127.0.0.1',
      port: 2222,
      jump: { host: 'vps.example', port: 22, username: 'dev' },
      id: 'b',
    };
    const started: string[] = [];
    const attempt = (route: SSHRoute) => {
      started.push(route.id ?? '');
      return new Promise<string>(() => undefined);
    };
    const clock = new FakeClock();

    raceRoutes([direct, viaJump], { attempt, discard: () => undefined, clock });
    expect(started).toEqual(['a']);
    await clock.advance(400);
    expect(started).toEqual(['a', 'b']);

    started.length = 0;
    raceRoutes([viaJump, { ...viaJump, id: 'c' }], { attempt, discard: () => undefined, clock });
    expect(started).toEqual(['b', 'c']);
  });
});

describe('host key verification gate', () => {
  it('runs verifications one at a time, in arrival order', async () => {
    const gate = new HostKeyVerificationGate();
    let active = 0;
    let peak = 0;
    const order: number[] = [];
    await Promise.all(
      [0, 1, 2, 3, 4].map((index) =>
        gate.withLock(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await flushMicrotasks(3);
          order.push(index);
          active -= 1;
        }),
      ),
    );
    expect(peak).toBe(1);
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });

  it('releases the lock when the body throws', async () => {
    const gate = new HostKeyVerificationGate();
    await expect(gate.withLock(async () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
    expect(await gate.withLock(async () => 'free')).toBe('free');
  });

  it('a cancelled waiter leaves the queue', async () => {
    const gate = new HostKeyVerificationGate();
    let release: () => void = () => undefined;
    const holder = gate.withLock(() => new Promise<void>((resolve) => (release = resolve)));
    const waiting = createCancellation();
    let ran = false;
    const waiter = gate.withLock(async () => {
      ran = true;
    }, waiting.signal);

    waiting.cancel();
    await expect(waiter).rejects.toBeInstanceOf(CancelledError);

    release();
    await holder;
    expect(ran).toBe(false);
    expect(await gate.withLock(async () => 'free')).toBe('free');
  });
});
