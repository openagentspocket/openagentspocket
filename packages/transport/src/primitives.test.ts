import { createCancellation, FakeClock, TransportFailure } from '@openagentspocket/core';
import { SshError } from 'agentico-ssh';
import { describe, expect, it } from 'vitest';
import { ChannelAdmission, PRODUCTION_LIMITS } from './admission';
import { withDeadline } from './deadline';
import { invalidatesConnection, mapConnectError, mapOperationError } from './error-mapping';
import { SharedOperation } from './shared-operation';
import { markerValue } from './transport';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('ChannelAdmission', () => {
  it('keeps the production budgets', () => {
    expect(PRODUCTION_LIMITS).toMatchObject({
      ordinaryForwarding: 8,
      events: 1,
      ordinarySession: 4,
      attach: 5,
      preview: 6,
      connection: 24,
    });
  });

  it('holds a class at its limit and hands the slot to the next waiter', async () => {
    const admission = new ChannelAdmission({ ...PRODUCTION_LIMITS, ordinarySession: 2 });
    const first = await admission.acquire('ordinarySession');
    await admission.acquire('ordinarySession');
    let third = false;
    const waiting = admission.acquire('ordinarySession').then(() => {
      third = true;
    });
    await settle();
    expect(third).toBe(false);
    // Another class is not blocked by a full one.
    (await admission.acquire('events')).release();
    first.release();
    await waiting;
    expect(admission.snapshot().ordinarySession).toBe(2);
  });

  it('releases once however many times release is called', async () => {
    const admission = new ChannelAdmission();
    const lease = await admission.acquire('attach');
    lease.release();
    lease.release();
    expect(admission.snapshot()).toMatchObject({ attach: 0, connection: 0 });
  });

  it('enforces the connection ceiling across classes', async () => {
    const admission = new ChannelAdmission({ ...PRODUCTION_LIMITS, connection: 2 });
    await admission.acquire('preview');
    await admission.acquire('attach');
    let admitted = false;
    admission.acquire('events').then(() => {
      admitted = true;
    });
    await settle();
    expect(admitted).toBe(false);
  });

  it('drops a cancelled waiter without spending a slot', async () => {
    const admission = new ChannelAdmission({ ...PRODUCTION_LIMITS, events: 1 });
    const held = await admission.acquire('events');
    const cancel = createCancellation();
    const waiting = admission.acquire('events', cancel.signal);
    cancel.cancel();
    await expect(waiting).rejects.toThrow('cancelled');
    held.release();
    expect(admission.snapshot().events).toBe(0);
  });

  it('releases the slot when the operation fails', async () => {
    const admission = new ChannelAdmission();
    await expect(
      admission.withChannel('ordinaryForwarding', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(admission.snapshot().ordinaryForwarding).toBe(0);
  });
});

describe('withDeadline', () => {
  it('times out, aborts the operation signal and drops its late result', async () => {
    const clock = new FakeClock();
    let aborted = false;
    const pending = withDeadline(clock, 1_000, (signal) => {
      signal.addEventListener('abort', () => {
        aborted = true;
      });
      return new Promise<string>(() => {});
    });
    pending.catch(() => undefined);
    await clock.advance(999);
    expect(aborted).toBe(false);
    await clock.advance(1);
    await expect(pending).rejects.toMatchObject({ error: { kind: 'timedOut' } });
    expect(aborted).toBe(true);
  });

  it('resolves with the value and clears its timer', async () => {
    const clock = new FakeClock();
    expect(await withDeadline(clock, 1_000, async () => 7)).toBe(7);
    expect(clock.pendingTimers).toBe(0);
  });

  it('fails with cancelled when the caller cancels', async () => {
    const clock = new FakeClock();
    const cancel = createCancellation();
    const pending = withDeadline(clock, 1_000, () => new Promise<void>(() => {}), cancel.signal);
    cancel.cancel();
    await expect(pending).rejects.toMatchObject({ error: { kind: 'cancelled' } });
  });
});

describe('SharedOperation', () => {
  it('joins concurrent demands into one run', async () => {
    const operation = new SharedOperation<number>(false);
    let runs = 0;
    const start = async () => {
      runs += 1;
      await settle();
      return runs;
    };
    expect(await Promise.all([operation.value(start), operation.value(start)])).toEqual([1, 1]);
    expect(await operation.value(start)).toBe(2);
  });

  it('memoizes a success only when asked to, and never a failure', async () => {
    const cached = new SharedOperation<number>(true);
    let runs = 0;
    await cached.value(async () => ++runs);
    await cached.value(async () => ++runs);
    expect(runs).toBe(1);
    const volatile = new SharedOperation<number>(false);
    await expect(volatile.value(async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(await volatile.value(async () => 5)).toBe(5);
  });

  it('lets a waiter leave without cancelling the run', async () => {
    const operation = new SharedOperation<string>(false);
    let finish: (value: string) => void = () => {};
    const start = () => new Promise<string>((resolve) => (finish = resolve));
    const cancel = createCancellation();
    const leaver = operation.value(start, cancel.signal);
    const stayer = operation.value(start);
    cancel.cancel();
    await expect(leaver).rejects.toThrow('cancelled');
    finish('done');
    expect(await stayer).toBe('done');
  });
});

describe('error mapping', () => {
  const connect = (code: ConstructorParameters<typeof SshError>[0]) =>
    mapConnectError(new SshError(code)).kind;
  const operate = (code: ConstructorParameters<typeof SshError>[0]) =>
    mapOperationError(new SshError(code)).kind;

  it('classifies the shared cases the same before and after connecting', () => {
    for (const [code, kind] of [
      ['authenticationFailed', 'authenticationFailed'],
      ['timedOut', 'timedOut'],
      ['cancelled', 'cancelled'],
      ['forwardingDenied', 'tcpForwardingUnavailable'],
      ['keyNotFound', 'deviceKeyCorrupt'],
      ['keychainFailed', 'keyAccessNotConfirmed'],
    ] as const) {
      expect([connect(code), operate(code)]).toEqual([kind, kind]);
    }
  });

  it('reads connect-time transport failures as an unreachable server', () => {
    for (const code of [
      'connectionFailed',
      'targetUnreachable',
      'algorithmNegotiationFailed',
    ] as const) {
      expect(connect(code)).toBe('sshUnreachable');
    }
    expect(connect('channelFailed')).toBe('channelFailed');
  });

  it('reads a short or oversized response as malformed, a dead connection as unreachable', () => {
    expect(operate('unexpectedEOF')).toBe('malformedResponse');
    expect(operate('responseTooLarge')).toBe('malformedResponse');
    expect(operate('connectionInvalidated')).toBe('sshUnreachable');
    expect(operate('streamLocalOpenFailed')).toBe('channelFailed');
  });

  it('passes our own failures through and wraps the unknown', () => {
    const own = new TransportFailure({ kind: 'timedOut' });
    expect(mapOperationError(own)).toEqual({ kind: 'timedOut' });
    expect(mapOperationError(new Error('odd')).kind).toBe('channelFailed');
  });

  it('flags only a dead connection as invalidating', () => {
    expect(invalidatesConnection(new SshError('connectionInvalidated'))).toBe(true);
    expect(invalidatesConnection(new SshError('timedOut'))).toBe(false);
  });
});

describe('markerValue', () => {
  it('takes the last marker line and drops a trailing CR', () => {
    expect(markerValue('motd\nA=/old\nnoise\nA=/home/dev\r\n', 'A=')).toBe('/home/dev');
    expect(markerValue('nothing here', 'A=')).toBeNull();
  });
});
