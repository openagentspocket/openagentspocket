import { describe, expect, it } from 'vitest';
import { failures, TransportFailureError } from './failure';
import { TerminalPermits } from './terminal-permits';
import { TransportWaiters } from './transport-waiters';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

async function outcome(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    return error instanceof TransportFailureError ? error.failure.kind : 'other';
  }
}

describe('TerminalPermits', () => {
  it('admits five distinct targets and holds the sixth until one ends', async () => {
    const permits = new TerminalPermits();
    for (const n of [1, 2, 3, 4, 5]) await permits.acquire(`t${n}`);
    let sixth = false;
    const waiting = permits.acquire('t6').then(() => {
      sixth = true;
    });
    await settle();
    expect(sixth).toBe(false);
    permits.release('t3');
    await waiting;
    expect(permits.activeCount).toBe(5);
  });

  it('gives each target one owner, and a null target excludes everyone', async () => {
    const permits = new TerminalPermits();
    await permits.acquire('same');
    const order: string[] = [];
    const duplicate = permits.acquire('same').then(() => order.push('same'));
    const exclusive = permits.acquire(null).then(() => order.push('null'));
    await permits.acquire('other');
    await settle();
    expect(order).toEqual([]);
    permits.release('same');
    await duplicate;
    permits.release('same');
    permits.release('other');
    await exclusive;
    expect(order).toEqual(['same', 'null']);
  });

  it('drops an aborted waiter without consuming a permit', async () => {
    const permits = new TerminalPermits();
    await permits.acquire('same');
    const controller = new AbortController();
    const cancelled = permits.acquire('same', controller.signal);
    controller.abort();
    expect(await outcome(cancelled)).toBe('cancelled');
    permits.release('same');
    expect(permits.activeCount).toBe(0);
    await permits.acquire('same');
  });

  it('waits for idle', async () => {
    const permits = new TerminalPermits();
    await permits.acquire('a');
    let idle = false;
    const waiting = permits.waitForIdle().then(() => {
      idle = true;
    });
    await settle();
    expect(idle).toBe(false);
    permits.release('a');
    await waiting;
  });
});

describe('TransportWaiters', () => {
  it('rejects a terminal waiter pinned to an older activation', async () => {
    const waiters = new TransportWaiters<string>();
    const stale = waiters.waitForTerminal(1);
    const unpinned = waiters.waitForTerminal(undefined);
    const rpc = waiters.waitForTransport();
    waiters.resume('t', 2, 0);
    expect(await outcome(stale)).toBe('cancelled');
    expect(await unpinned).toEqual({
      transport: 't',
      activationGeneration: 2,
      transportGeneration: 0,
    });
    expect(await rpc).toBe('t');
  });

  it('keeps waiters pinned to another activation when failing one', async () => {
    const waiters = new TransportWaiters<string>();
    const other = waiters.waitForTerminal(2);
    const unpinned = waiters.waitForTerminal(undefined);
    const failing = waiters.waitForTerminal(1);
    waiters.failTerminal(failures.timedOut(), 1);
    expect(await outcome(failing)).toBe('timedOut');
    expect(await outcome(unpinned)).toBe('timedOut');
    expect(waiters.terminalCount).toBe(1);
    waiters.resume('t', 2, 4);
    expect((await other).transportGeneration).toBe(4);
  });

  it('lets a kept waiter abort after a partial failure', async () => {
    const waiters = new TransportWaiters<string>();
    const controller = new AbortController();
    const kept = waiters.waitForTerminal(2, controller.signal);
    waiters.failTerminal(failures.timedOut(), 1);
    controller.abort();
    expect(await outcome(kept)).toBe('cancelled');
    expect(waiters.terminalCount).toBe(0);
  });

  it('removes an aborted waiter', async () => {
    const waiters = new TransportWaiters<string>();
    const controller = new AbortController();
    const parked = waiters.waitForTransport(controller.signal);
    waiters.failTerminal(failures.cancelled());
    controller.abort();
    expect(await outcome(parked)).toBe('cancelled');
    expect(waiters.rpcCount).toBe(0);
  });
});
