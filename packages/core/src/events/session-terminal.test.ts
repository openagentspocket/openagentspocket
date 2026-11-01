import { describe, expect, it } from 'vitest';
import { failures, failWith, type TransportFailure, TransportFailureError } from './failure';
import { FakeClock } from './fake-clock';
import { CallGate, ScriptedEventsTransport, SequencedConnector } from './scripted-transport';
import { EventsSession } from './session';
import type { EventsSessionOptions, EventsTransport } from './session-options';
import { type EventsSessionUpdate, globalSubscription, statusUpdate } from './types';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const initial = [globalSubscription('pane.agent_detected')];
const connecting = statusUpdate({ kind: 'connecting' });
const connected = statusUpdate({ kind: 'connected' });

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

const scripted = (version: string) => new ScriptedEventsTransport({ version, protocolVersion: 17 });
const version = (transport: ScriptedEventsTransport) =>
  transport.ping().then((info) => info.version);
const deadLink = failures.sshUnreachable('dead link');

async function failureOf(promise: Promise<unknown>): Promise<TransportFailure | undefined> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TransportFailureError) return error.failure;
    throw error;
  }
  return undefined;
}

describe('EventsSession.withTerminalTransport', () => {
  it('runs five distinct terminals together; the sixth waits for a teardown', async () => {
    const { session } = harness(async () => scripted('only'));
    const gate = new CallGate();
    const sixthGate = new CallGate();
    await session.resume();
    const five = [1, 2, 3, 4, 5].map((n) =>
      session.withTerminalTransport(() => gate.waitUntilOpen(), { target: `terminal-${n}` }),
    );
    await gate.waitForEntry(5);
    const sixth = session.withTerminalTransport(() => sixthGate.waitUntilOpen(), {
      target: 'sixth',
    });
    await settle();
    expect(sixthGate.entryCount).toBe(0);
    gate.open();
    await sixthGate.waitForEntry();
    sixthGate.open();
    await Promise.all([...five, sixth]);
    await session.end();
  });

  it('queues a duplicate target, and a cancelled duplicate frees nothing', async () => {
    const { session } = harness(async () => scripted('only'));
    const gate = new CallGate();
    await session.resume();
    const first = session.withTerminalTransport(() => gate.waitUntilOpen(), { target: 'same' });
    await gate.waitForEntry();
    const controller = new AbortController();
    let duplicateRan = false;
    const duplicate = session.withTerminalTransport(
      async () => {
        duplicateRan = true;
      },
      { target: 'same', signal: controller.signal },
    );
    await settle();
    controller.abort();
    expect(await failureOf(duplicate)).toEqual(failures.cancelled());
    gate.open();
    await first;
    await session.withTerminalTransport(async () => {}, { target: 'same' });
    expect(duplicateRan).toBe(false);
    await session.end();
  });

  it('starts a terminal before the events subscription is ready', async () => {
    const transport = scripted('only');
    const subscriptionGate = new CallGate();
    transport.gateNextSubscription(subscriptionGate);
    const { session, next } = harness(async () => transport);
    await session.resume();
    await subscriptionGate.waitForEntry();
    const generation = await session.withTerminalTransport(async (_, gen) => gen);
    expect(generation).toBe(0);
    expect(await next()).toEqual(connecting);
    expect(session.updates.size).toBe(0);
    subscriptionGate.open();
    expect(await next()).toEqual(connected);
    await session.end();
  });

  it('waits for the ping-proven transport installed after its request', async () => {
    const transport = scripted('only');
    const pingGate = new CallGate();
    const subscriptionGate = new CallGate();
    transport.gateNextPing(pingGate);
    transport.gateNextSubscription(subscriptionGate);
    let registered = 0;
    const { session } = harness(async () => transport, {
      onTerminalWaiterRegistered: () => {
        registered += 1;
      },
    });
    let ranOn: number | undefined;
    const terminal = session.withTerminalTransport(async (_, gen) => {
      ranOn = gen;
    });
    await settle();
    expect(registered).toBe(1);

    await session.resume();
    await pingGate.waitForEntry();
    expect(ranOn).toBeUndefined();
    pingGate.open();
    await subscriptionGate.waitForEntry();
    await terminal;
    expect(ranOn).toBe(0);
    subscriptionGate.open();
    await session.end();
  });

  it('drops a cancelled readiness waiter and releases its permit', async () => {
    const transport = scripted('only');
    const subscriptionGate = new CallGate();
    transport.gateNextSubscription(subscriptionGate);
    const { session } = harness(async () => transport);
    const controller = new AbortController();
    let cancelledRan = false;
    const cancelled = session.withTerminalTransport(
      async () => {
        cancelledRan = true;
      },
      { signal: controller.signal },
    );
    await settle();
    controller.abort();
    expect(await failureOf(cancelled)).toEqual(failures.cancelled());

    await session.resume();
    await subscriptionGate.waitForEntry();
    expect(await session.withTerminalTransport(async (_, gen) => gen)).toBe(0);
    expect(cancelledRan).toBe(false);
    subscriptionGate.open();
    await session.end();
  });

  it('hands the real failure to a terminal after the session stopped on it', async () => {
    const transport = scripted('only');
    const failure = { kind: 'socketNotFound', path: '/remote/herdr.sock' };
    transport.failPing(1, failure);
    const { session, next } = harness(async () => transport);
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(statusUpdate({ kind: 'failed', failure }));
    expect(await failureOf(session.withTerminalTransport(async () => 'never'))).toEqual(failure);
    await session.end();
  });

  it('redials at once after a terminal hits a dead link, for its reattach', async () => {
    const first = scripted('first');
    const { session, next } = harness(
      new SequencedConnector([first, scripted('replacement')]).connect,
    );
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);

    first.setConnectionAlive(false);
    const lost = session.withTerminalTransport(async () => {
      throw failWith(deadLink);
    });
    expect(await failureOf(lost)).toEqual(deadLink);
    const reattach = await session.withTerminalTransport(async (t, gen) => [await version(t), gen]);
    expect(reattach).toEqual(['replacement', 1]);
    expect(await next()).toEqual(connected);
    expect(first.isClosed).toBe(true);
    await session.end();
  });

  it('replaces a transport distrusted while its own subscribe was in flight', async () => {
    const first = scripted('first');
    const second = scripted('second');
    const { session, next } = harness(
      new SequencedConnector([first, second, scripted('third')]).connect,
    );
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);

    const subscribeGate = new CallGate();
    second.gateNextSubscription(subscribeGate);
    first.setConnectionAlive(false);
    const lost = session.withTerminalTransport(async () => {
      throw failWith(deadLink);
    });
    expect(await failureOf(lost)).toEqual(deadLink);
    await subscribeGate.waitForEntry();

    const timedOut = session.withTerminalTransport(async (t) => {
      expect(await version(t)).toBe('second');
      throw failWith(failures.timedOut());
    });
    expect(await failureOf(timedOut)).toEqual(failures.timedOut());
    subscribeGate.open();

    const reattach = await session.withTerminalTransport(async (t, gen) => [await version(t), gen]);
    expect(reattach).toEqual(['third', 2]);
    expect(second.isClosed).toBe(true);
    await session.end();
  });

  it('cancels a readiness waiter from an older activation on retry', async () => {
    const first = scripted('first');
    const second = scripted('second');
    const firstPingGate = new CallGate();
    const secondSubscriptionGate = new CallGate();
    first.gateNextPing(firstPingGate);
    second.gateNextSubscription(secondSubscriptionGate);
    const { session } = harness(new SequencedConnector([first, second]).connect);
    await session.resume();
    await firstPingGate.waitForEntry();
    const ranOn: string[] = [];
    const stale = session.withTerminalTransport(async (t) => {
      ranOn.push(await version(t));
    });
    await settle();

    await session.retry();
    expect(await failureOf(stale)).toEqual(failures.cancelled());
    await secondSubscriptionGate.waitForEntry();
    const current = await session.withTerminalTransport(async (t, gen) => {
      ranOn.push(await version(t));
      return gen;
    });
    expect(current).toBe(0);
    expect(ranOn).toEqual(['second']);

    // The abandoned first dial finishes late: it only closes its own Transport.
    firstPingGate.open();
    await settle();
    expect(first.isClosed).toBe(true);
    secondSubscriptionGate.open();
    await session.end();
  });

  it('closes a distrusted transport before its redial dials', async () => {
    const first = scripted('first');
    const gate = new CallGate();
    const connector = new SequencedConnector([first, scripted('second')]);
    const { session, next } = harness(async () => {
      const transport = await connector.connect();
      if (connector.connectCount > 1) await gate.waitUntilOpen();
      return transport;
    });
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    const lost = session.withTerminalTransport(async () => {
      throw failWith(deadLink);
    });
    expect(await failureOf(lost)).toEqual(deadLink);
    await gate.waitForEntry();
    expect(first.isClosed).toBe(true);
    gate.open();
    await session.end();
  });

  it('closes a distrusted transport on teardown even before any redial', async () => {
    const first = scripted('first');
    const connector = new SequencedConnector([first, scripted('second')]);
    const { session, next } = harness(connector.connect);
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);

    // A retryable drop parks the run loop in backoff with `first` still installed.
    first.failEventStream(failures.channelFailed('remote closed'));
    expect(await next()).toMatchObject({ status: { kind: 'reconnecting', attempt: 1 } });
    const lost = session.withTerminalTransport(async () => {
      throw failWith(deadLink);
    });
    expect(await failureOf(lost)).toEqual(deadLink);
    expect(first.isClosed).toBe(false);

    await session.suspend();
    expect(first.isClosed).toBe(true);
    expect(connector.connectCount).toBe(1);
    await session.end();
  });
});
