import { describe, expect, it } from 'vitest';
import { failures, failWith } from './failure';
import { FakeClock } from './fake-clock';
import { CallGate, ScriptedEventsTransport, SequencedConnector } from './scripted-transport';
import { EventsSession } from './session';
import type { EventsSessionOptions, EventsTransport } from './session-options';
import { type EventsSessionUpdate, globalSubscription, statusUpdate } from './types';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const initial = [globalSubscription('pane.agent_detected')];
const connecting = statusUpdate({ kind: 'connecting' });
const connected = statusUpdate({ kind: 'connected' });
const suspended = statusUpdate({ kind: 'suspended' });

function harness<T extends EventsTransport>(
  connect: () => Promise<T>,
  options: Partial<EventsSessionOptions<T>> = {},
) {
  const clock = new FakeClock(settle);
  const session = new EventsSession<T>({
    subscriptions: initial,
    connect,
    clock,
    keepalive: null,
    ...options,
  });
  const next = async (): Promise<EventsSessionUpdate | undefined> =>
    (await session.updates.next()).value;
  return { clock, session, next };
}

describe('EventsSession reconnect backoff', () => {
  it('backs off 1, 2, 4, 8, 16 s, then 30 s per attempt, without limit', async () => {
    let dials = 0;
    const { clock, session, next } = harness(async (): Promise<ScriptedEventsTransport> => {
      dials += 1;
      throw failWith(failures.sshUnreachable('connection refused'));
    });
    await session.resume();
    expect(await next()).toEqual(connecting);

    const delays: number[] = [];
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const update = await next();
      expect(update).toMatchObject({ status: { kind: 'reconnecting', attempt } });
      const delay =
        update?.type === 'status' && update.status.kind === 'reconnecting'
          ? update.status.delayMs
          : -1;
      delays.push(delay);
      await clock.advance(delay - 1);
      expect(dials).toBe(attempt);
      await clock.advance(1);
    }
    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000]);
    await session.end();
  });

  it('starts over at 1 s after a connection succeeds', async () => {
    const transport = new ScriptedEventsTransport();
    let dials = 0;
    const { clock, session, next } = harness(async () => {
      dials += 1;
      if (dials <= 2) throw failWith(failures.timedOut());
      return transport;
    });
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toMatchObject({ status: { kind: 'reconnecting', attempt: 1 } });
    await clock.advance(1_000);
    expect(await next()).toMatchObject({
      status: { kind: 'reconnecting', attempt: 2, delayMs: 2_000 },
    });
    await clock.advance(2_000);
    expect(await next()).toEqual(connected);

    transport.failEventStream(failures.channelFailed('remote closed'));
    expect(await next()).toEqual(
      statusUpdate({
        kind: 'reconnecting',
        attempt: 1,
        delayMs: 1_000,
        failure: failures.channelFailed('remote closed'),
      }),
    );
    await clock.advance(1_000);
    expect(await next()).toEqual(connected);
    await session.end();
  });

  it.each([
    'authenticationFailed',
    'deviceKeyCorrupt',
    'rsaKeyCorrupt',
    'hostKeyMismatch',
    'socketNotFound',
    'streamLocalOpenFailed',
  ])('stops on a non-retryable %s instead of reconnecting', async (kind) => {
    let dials = 0;
    const { clock, session, next } = harness(async (): Promise<ScriptedEventsTransport> => {
      dials += 1;
      throw failWith({ kind });
    });
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(statusUpdate({ kind: 'failed', failure: { kind } }));
    await clock.advance(120_000);
    expect(dials).toBe(1);
    expect(session.updates.size).toBe(0);
    await session.end();
  });
});

describe('EventsSession protocol floor', () => {
  it.each([17, 22, 23, 40])('connects to protocol %i (a floor, not equality)', async (protocol) => {
    const transport = new ScriptedEventsTransport({ version: 'x', protocolVersion: protocol });
    const { session, next } = harness(async () => transport);
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    await session.end();
  });

  it('fails on protocol 16 without retrying and closes that connection', async () => {
    const transport = new ScriptedEventsTransport({ version: 'old', protocolVersion: 16 });
    const connector = new SequencedConnector([transport]);
    const { clock, session, next } = harness(connector.connect);
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(
      statusUpdate({ kind: 'failed', failure: failures.protocolVersionMismatch(16, 17) }),
    );
    expect(transport.isClosed).toBe(true);
    expect(transport.capturedSubscriptions).toEqual([]);
    await clock.advance(60_000);
    expect(connector.connectCount).toBe(1);
    await session.end();
  });
});

describe('EventsSession lifecycle', () => {
  it('announces connecting on retry before teardown closes the transport', async () => {
    const first = new ScriptedEventsTransport();
    const second = new ScriptedEventsTransport();
    const { session, next } = harness(new SequencedConnector([first, second]).connect);
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);

    const closeGate = new CallGate();
    first.gateNextClose(closeGate);
    const retrying = session.retry();
    await closeGate.waitForEntry();
    expect(await next()).toEqual(connecting);
    expect(first.isClosed).toBe(false);
    closeGate.open();
    await retrying;
    expect(await next()).toEqual(connected);
    expect(first.isClosed).toBe(true);
    await session.end();
  });

  it('suspends without waiting for a stalled connection attempt', async () => {
    const stalled = new ScriptedEventsTransport();
    const resumed = new ScriptedEventsTransport();
    const gate = new CallGate();
    let attempts = 0;
    const { session, next } = harness(async () => {
      attempts += 1;
      if (attempts > 1) return resumed;
      await gate.waitUntilOpen();
      return stalled;
    });
    await session.resume();
    expect(await next()).toEqual(connecting);
    await gate.waitForEntry();

    let suspendedPromptly = false;
    const suspending = session.suspend().then(() => {
      suspendedPromptly = true;
    });
    await settle();
    expect(suspendedPromptly).toBe(true);
    await suspending;
    expect(await next()).toEqual(suspended);

    // The abandoned dial may finish later: it only closes its own Transport.
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    expect(attempts).toBe(2);
    gate.open();
    await settle();
    expect(stalled.isClosed).toBe(true);
    expect(resumed.isClosed).toBe(false);
    expect(session.updates.size).toBe(0);
    await session.end();
  });

  it('serializes a resume that races into a suspend teardown', async () => {
    const first = new ScriptedEventsTransport();
    const second = new ScriptedEventsTransport();
    const closeGate = new CallGate();
    first.gateNextClose(closeGate);
    const connector = new SequencedConnector([first, second]);
    const { clock, session, next } = harness(connector.connect);
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);

    const suspending = session.suspend();
    await closeGate.waitForEntry();
    const resuming = session.resume();
    await clock.advance(200);
    expect(connector.connectCount).toBe(1);

    closeGate.open();
    await suspending;
    await resuming;
    expect(await next()).toEqual(suspended);
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    expect(connector.connectCount).toBe(2);
    expect(first.isClosed).toBe(true);
    expect(second.isClosed).toBe(false);

    await session.end();
    expect(await next()).toEqual(statusUpdate({ kind: 'ended' }));
    expect(await session.updates.next()).toEqual({ value: undefined, done: true });
    expect(second.isClosed).toBe(true);
  });

  it('stops a stuck dial at once as suspended, and retry dials again', async () => {
    let attempts = 0;
    const never = new Promise<never>(() => {});
    const { session, next } = harness(async (): Promise<ScriptedEventsTransport> => {
      attempts += 1;
      return never;
    });
    await session.resume();
    expect(await next()).toEqual(connecting);
    await settle();
    expect(attempts).toBe(1);

    await session.cancelConnecting();
    expect(await next()).toEqual(suspended);

    await session.retry();
    expect(await next()).toEqual(connecting);
    await settle();
    expect(attempts).toBe(2);
    await session.end();
  });

  it('leaves a live channel alone on cancelConnecting', async () => {
    const transport = new ScriptedEventsTransport();
    const { session, next } = harness(async () => transport);
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    await session.cancelConnecting();
    expect(session.updates.size).toBe(0);
    expect(transport.isClosed).toBe(false);
    await session.end();
  });

  it('is idempotent at both ends: resume while active and end twice', async () => {
    const transport = new ScriptedEventsTransport();
    const connector = new SequencedConnector([transport]);
    const { session, next } = harness(connector.connect);
    await session.resume();
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    expect(connector.connectCount).toBe(1);
    await session.end();
    await session.end();
    expect(await next()).toEqual(statusUpdate({ kind: 'ended' }));
    expect(await next()).toBeUndefined();
  });
});
