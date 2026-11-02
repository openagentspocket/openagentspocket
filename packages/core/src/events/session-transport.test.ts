import { describe, expect, it } from 'vitest';
import { type TransportError, TransportFailure } from '../errors/transport-error';
import { FakeClock } from '../hosts/cancellation';
import { failures, failWith } from './failure';
import { CallGate, ScriptedEventsTransport, SequencedConnector } from './scripted-transport';
import { EventsSession } from './session';
import type { EventsSessionOptions, EventsTransport } from './session-options';
import {
  type EventsSessionUpdate,
  globalSubscription,
  paneSubscription,
  statusUpdate,
} from './types';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const initial = [globalSubscription('pane.agent_detected')];
const updated = [...initial, paneSubscription('pane.agent_status_changed', 'w1:p1')];
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

async function failureOf(promise: Promise<unknown>): Promise<TransportError | undefined> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TransportFailure) return error.error;
    throw error;
  }
  return undefined;
}

/** A connector whose dials after the first wait on `gate`. */
function gatedRedial(transports: ScriptedEventsTransport[], gate: CallGate) {
  const connector = new SequencedConnector(transports);
  return async () => {
    const transport = await connector.connect();
    if (connector.connectCount > 1) await gate.waitUntilOpen();
    return transport;
  };
}

describe('EventsSession.withTransport', () => {
  it.each<TransportError>([
    { kind: 'gitTimedOut' },
    { kind: 'hostFileTimedOut' },
    { kind: 'hostFileUnreadable', status: 3 },
    failures.cancelled(),
  ])('keeps the session on a non-link failure %o, without retrying', async (failure) => {
    const transport = scripted('first');
    const connector = new SequencedConnector([transport, scripted('replacement')]);
    const { session, next } = harness(connector.connect);
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);

    transport.failPing(transport.pingCount + 1, failure);
    let attempts = 0;
    const result = session.withTransport((t) => {
      attempts += 1;
      return t.ping();
    });
    expect(await failureOf(result)).toEqual(failure);
    expect(attempts).toBe(1);
    expect(connector.connectCount).toBe(1);
    expect(session.transportGeneration).toBe(0);
    expect(transport.capturedSubscriptions).toEqual([initial]);
    expect(transport.isClosed).toBe(false);
    expect((await session.withTransport((t) => t.ping())).protocolVersion).toBe(17);
    await session.end();
  });

  it('waits out the silent transport replacement instead of failing', async () => {
    const first = scripted('first');
    const replacement = scripted('replacement');
    const gate = new CallGate();
    const { clock, session, next } = harness(gatedRedial([first, replacement], gate));
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);

    // A degraded link the events reader has not reported: the reinstall replaces it.
    first.setConnectionAlive(false);
    await session.updateSubscriptions(updated);
    await settle();
    const probe = session.withTransport(version);
    await clock.advance(5_000);
    gate.open();
    expect(await probe).toBe('replacement');
    // A fresh transport sees exactly one subscribe, with the current set.
    expect(replacement.capturedSubscriptions).toEqual([updated]);
    // The replacement announced no failure: only the fresh `connected`.
    expect(await next()).toEqual(connected);
    expect(session.transportGeneration).toBe(1);
    await session.end();
  });

  it('releases a waiter with the reconnect cause when the replacement dial fails', async () => {
    const first = scripted('first');
    let dials = 0;
    const { clock, session, next } = harness(async () => {
      dials += 1;
      if (dials > 1) throw failWith(failures.timedOut());
      return first;
    });
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);

    first.setConnectionAlive(false);
    await session.updateSubscriptions(updated);
    await settle();
    const probe = failureOf(session.withTransport(async () => 'delivered'));
    await clock.advance(1_000);
    expect(await probe).toEqual(failures.timedOut());
    expect(await next()).toEqual(
      statusUpdate({
        kind: 'reconnecting',
        attempt: 1,
        delayMs: 1_000,
        failure: failures.timedOut(),
      }),
    );
    await session.end();
  });

  it('retries once on the replacement after a send fails on a dead transport', async () => {
    const first = scripted('first');
    const replacement = scripted('replacement');
    const gate = new CallGate();
    const { session, next } = harness(gatedRedial([first, replacement], gate));
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);

    first.setConnectionAlive(false);
    let attempts = 0;
    const probe = session.withTransport((t) => {
      attempts += 1;
      return version(t);
    });
    await settle();
    expect(attempts).toBe(1);
    gate.open();
    expect(await probe).toBe('replacement');
    expect(attempts).toBe(2);
    expect(first.isClosed).toBe(true);
    await session.end();
  });

  it('surfaces the original cause when the retry times out too', async () => {
    const first = scripted('first');
    const replacement = scripted('replacement');
    const { session, next } = harness(new SequencedConnector([first, replacement]).connect);
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    const dead = failures.sshUnreachable('dead link');
    const result = session.withTransport(async (t) => {
      throw failWith(t === first ? dead : failures.timedOut());
    });
    expect(await failureOf(result)).toEqual(dead);
    await session.end();
  });

  it('never runs a run-once change twice, but still redials', async () => {
    const first = scripted('first');
    const replacement = scripted('replacement');
    const { session, next } = harness(new SequencedConnector([first, replacement]).connect);
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);

    first.setConnectionAlive(false);
    let runs = 0;
    const change = session.withTransportRunningOnce(async () => {
      runs += 1;
      throw failWith(failures.sshUnreachable('dead link'));
    });
    expect(await failureOf(change)).toEqual(failures.sshUnreachable('dead link'));
    expect(runs).toBe(1);
    expect(await session.withTransport(version)).toBe('replacement');
    expect(runs).toBe(1);
    await session.end();
  });

  it('hands the real failure to a request after the session stopped on it', async () => {
    const transport = scripted('first');
    const failure = { kind: 'socketNotFound', path: '/remote/herdr.sock' };
    transport.failPing(1, failure);
    const { session, next } = harness(async () => transport);
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(statusUpdate({ kind: 'failed', failure }));
    expect(await failureOf(session.withTransport(async () => 'never'))).toEqual(failure);
    await session.end();
  });

  it('fails at once on a suspended session', async () => {
    const transport = scripted('first');
    const { session, next } = harness(async () => transport);
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    await session.suspend();
    expect(await next()).toEqual(statusUpdate({ kind: 'suspended' }));
    expect(await failureOf(session.withTransport(async () => 'never'))).toEqual(
      failures.sshUnreachable('The Host is not connected.'),
    );
    await session.end();
  });

  it('lets a parked request abort', async () => {
    const first = scripted('first');
    const gate = new CallGate();
    const { session, next } = harness(gatedRedial([first, scripted('replacement')], gate));
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    first.setConnectionAlive(false);
    await session.updateSubscriptions(updated);
    await settle();
    const controller = new AbortController();
    const probe = failureOf(session.withTransport(async () => 'never', controller.signal));
    controller.abort();
    expect(await probe).toEqual(failures.cancelled());
    gate.open();
    expect(await next()).toEqual(connected);
    await session.end();
  });
});
