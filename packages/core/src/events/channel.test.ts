import { describe, expect, it } from 'vitest';
import { TransportFailure } from '../errors/transport-error';
import { FakeClock } from '../hosts/cancellation';
import { EVENTS_DROPPED_EVENT, type HerdrEvent, type HerdrEventStream } from '../wire';
import { CHANNEL_CLOSE_TIMEOUT_MS, type EventsDuplex, openEventsChannel } from './channel';
import { EventsSession } from './session';
import type { EventsTransport } from './session-options';
import { globalSubscription, paneSubscription } from './types';
import { decodeUtf8, encodeUtf8 } from './utf8';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

/** The remote end of a streamlocal channel, scripted by the test. */
class FakeDuplex implements EventsDuplex {
  readonly written: string[] = [];
  closed = false;
  failWrites = false;
  /** The write never settles, as on a wedged native channel. */
  hangWrites = false;
  /** close() never settles, as on a wedged native channel. */
  hangClose = false;
  private data = new Set<(chunk: Uint8Array) => void>();
  private closes = new Set<(reason?: string) => void>();

  async write(data: Uint8Array) {
    if (this.failWrites) throw new Error('write refused');
    if (this.hangWrites) return new Promise<void>(() => {});
    this.written.push(decodeUtf8(data));
  }
  onData(listener: (chunk: Uint8Array) => void) {
    this.data.add(listener);
    return () => this.data.delete(listener);
  }
  onClose(listener: (reason?: string) => void) {
    this.closes.add(listener);
    return () => this.closes.delete(listener);
  }
  async close() {
    this.closed = true;
    if (this.hangClose) return new Promise<void>(() => {});
    for (const listener of this.closes) listener(undefined);
  }
  send(text: string | Uint8Array) {
    const bytes = typeof text === 'string' ? encodeUtf8(text) : text;
    for (const listener of this.data) listener(bytes);
  }
  remoteClose(reason?: string) {
    for (const listener of this.closes) listener(reason);
  }
  get requestId(): string {
    return JSON.parse(this.written[0] ?? '{}').id;
  }
  ack() {
    this.send(
      `${JSON.stringify({ id: this.requestId, result: { type: 'subscription_started' } })}\n`,
    );
  }
}

const event = (name: string, data?: unknown) =>
  `${JSON.stringify(data === undefined ? { event: name } : { event: name, data })}\n`;

function open(duplex: FakeDuplex, overrides: { bufferLimit?: number; maxLineBytes?: number } = {}) {
  const clock = new FakeClock(settle);
  const opening = openEventsChannel(duplex, {
    subscriptions: [
      globalSubscription('pane.agent_detected'),
      paneSubscription('pane.agent_status_changed', 'w1:p1'),
    ],
    requestId: 'req-1',
    clock,
    ...overrides,
  });
  return { clock, opening };
}

async function failureOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error instanceof TransportFailure ? error.error : error;
  }
  return undefined;
}

async function drain(stream: HerdrEventStream, count: number): Promise<HerdrEvent[]> {
  const iterator = stream.events[Symbol.asyncIterator]();
  const seen: HerdrEvent[] = [];
  for (let n = 0; n < count; n += 1) seen.push((await iterator.next()).value as HerdrEvent);
  return seen;
}

describe('openEventsChannel', () => {
  it('writes one events.subscribe line with dotted kinds and pane ids', async () => {
    const duplex = new FakeDuplex();
    const { opening } = open(duplex);
    await settle();
    expect(duplex.written).toHaveLength(1);
    expect(duplex.written[0]?.endsWith('\n')).toBe(true);
    expect(JSON.parse(duplex.written[0] ?? '')).toEqual({
      id: 'req-1',
      method: 'events.subscribe',
      params: {
        subscriptions: [
          { type: 'pane.agent_detected' },
          { type: 'pane.agent_status_changed', pane_id: 'w1:p1' },
        ],
      },
    });
    duplex.ack();
    await opening;
  });

  it('streams canonical events after the ack, skipping junk lines', async () => {
    const duplex = new FakeDuplex();
    const { opening } = open(duplex);
    await settle();
    const ack = JSON.stringify({ id: 'req-1', result: { type: 'subscription_started' } });
    duplex.send(`${ack}\n${event('pane_created', { pane_id: 'p1' })}not json\n`);
    const stream = await opening;
    duplex.send(event('brand_new_kind'));
    duplex.send('{"no_event_field":1}\n');
    expect(await drain(stream, 2)).toEqual([
      { kind: 'pane.created', data: { pane_id: 'p1' } },
      { kind: 'brand_new_kind', data: null },
    ]);
  });

  it('reassembles a line split across chunks, inside a multi-byte character', async () => {
    const duplex = new FakeDuplex();
    const { opening } = open(duplex);
    await settle();
    duplex.ack();
    const stream = await opening;
    const bytes = encodeUtf8(event('pane_updated', { title: 'ñandú 😀' }));
    const cut = bytes.indexOf(0xf0) + 2;
    duplex.send(bytes.subarray(0, cut));
    duplex.send(bytes.subarray(cut));
    expect(await drain(stream, 1)).toEqual([{ kind: 'pane.updated', data: { title: 'ñandú 😀' } }]);
  });

  it('fails with the server rejection, even when its id is empty', async () => {
    const duplex = new FakeDuplex();
    const { opening } = open(duplex);
    await settle();
    duplex.send('{"id":"","error":{"code":404,"message":"pane w1:p1 not found"}}\n');
    expect(await failureOf(opening)).toEqual({
      kind: 'apiRejected',
      code: '404',
      message: 'pane w1:p1 not found',
    });
    expect(duplex.closed).toBe(true);
  });

  it('rejects a success answer for another request', async () => {
    const duplex = new FakeDuplex();
    const { opening } = open(duplex);
    await settle();
    duplex.send('{"id":"someone-else","result":{"type":"subscription_started"}}\n');
    expect(await failureOf(opening)).toMatchObject({ kind: 'malformedResponse' });
  });

  it('times out an ack that never comes at the request deadline', async () => {
    const duplex = new FakeDuplex();
    const { clock, opening } = open(duplex);
    const failure = failureOf(opening);
    await clock.advance(14_999);
    expect(duplex.closed).toBe(false);
    await clock.advance(1);
    expect(await failure).toEqual({ kind: 'timedOut' });
    expect(duplex.closed).toBe(true);
  });

  it('times out a subscribe write that never settles at the request deadline', async () => {
    const duplex = new FakeDuplex();
    duplex.hangWrites = true;
    const { clock, opening } = open(duplex);
    const failure = failureOf(opening);
    await clock.advance(14_999);
    expect(duplex.closed).toBe(false);
    await clock.advance(1);
    expect(await failure).toEqual({ kind: 'timedOut' });
    expect(duplex.closed).toBe(true);
    expect(clock.pendingTimers).toBe(0);
  });

  it('reports a channel that ends before the ack', async () => {
    const duplex = new FakeDuplex();
    const { opening } = open(duplex);
    await settle();
    duplex.remoteClose();
    expect(await failureOf(opening)).toEqual({
      kind: 'channelFailed',
      detail: 'events channel ended before ack',
    });
  });

  it('surfaces a write failure and closes the channel', async () => {
    const duplex = new FakeDuplex();
    duplex.failWrites = true;
    const { opening } = open(duplex);
    expect(await failureOf(opening)).toBeInstanceOf(Error);
    expect(duplex.closed).toBe(true);
  });

  it('rejects the stream when the remote closes it, after buffered events', async () => {
    const duplex = new FakeDuplex();
    const { opening } = open(duplex);
    await settle();
    duplex.ack();
    const stream = await opening;
    duplex.send(event('tab_created'));
    duplex.remoteClose();
    const iterator = stream.events[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toMatchObject({ kind: 'tab.created' });
    expect(await failureOf(iterator.next())).toMatchObject({ kind: 'channelFailed' });
  });

  it('finishes cleanly on end(), closing the channel once', async () => {
    const duplex = new FakeDuplex();
    const { opening } = open(duplex);
    await settle();
    duplex.ack();
    const stream = await opening;
    await Promise.all([stream.end(), stream.end()]);
    expect(duplex.closed).toBe(true);
    const seen: HerdrEvent[] = [];
    for await (const item of stream.events) seen.push(item);
    expect(seen).toEqual([]);
  });

  it('bounds end() at 2 s when the channel close stalls', async () => {
    const duplex = new FakeDuplex();
    const { clock, opening } = open(duplex);
    await settle();
    duplex.ack();
    const stream = await opening;
    duplex.hangClose = true;
    let ended = false;
    void stream.end().then(() => {
      ended = true;
    });
    await clock.advance(CHANNEL_CLOSE_TIMEOUT_MS - 1);
    expect(duplex.closed).toBe(true);
    expect(ended).toBe(false);
    await clock.advance(1);
    expect(ended).toBe(true);
    expect((await stream.events.next()).done).toBe(true);
  });

  it('sheds the oldest events under overflow and marks the gap', async () => {
    const duplex = new FakeDuplex();
    const { opening } = open(duplex, { bufferLimit: 2 });
    await settle();
    duplex.ack();
    const stream = await opening;
    for (const n of [1, 2, 3, 4, 5]) duplex.send(event('pane_focused', { n }));
    expect(await drain(stream, 2)).toEqual([
      { kind: 'pane.focused', data: { n: 5 } },
      EVENTS_DROPPED_EVENT,
    ]);
  });

  it('fails a line longer than the response limit', async () => {
    const duplex = new FakeDuplex();
    const { opening } = open(duplex, { maxLineBytes: 64 });
    await settle();
    duplex.ack();
    const stream = await opening;
    duplex.send(`{"event":"pane_updated","data":"${'x'.repeat(100)}`);
    expect(await failureOf(drain(stream, 1))).toMatchObject({ kind: 'malformedResponse' });
    expect(duplex.closed).toBe(true);
  });
});

/** A Transport whose events ride a real channel over a fake duplex. */
class DuplexTransport implements EventsTransport {
  readonly duplexes: FakeDuplex[] = [];
  /** Applied to the next channel's duplex before its subscribe write. */
  prepareNext: ((duplex: FakeDuplex) => void) | undefined;
  constructor(private readonly clock: FakeClock) {}
  async ping() {
    return { version: 'duplex', protocolVersion: 17 };
  }
  isConnected() {
    return true;
  }
  async close() {}
  subscribeToEvents(subscriptions: Parameters<EventsTransport['subscribeToEvents']>[0]) {
    const duplex = new FakeDuplex();
    this.duplexes.push(duplex);
    this.prepareNext?.(duplex);
    this.prepareNext = undefined;
    const id = `req-${this.duplexes.length}`;
    const opening = openEventsChannel(duplex, { subscriptions, requestId: id, clock: this.clock });
    // herdr answers only a request it received.
    if (!duplex.hangWrites) void Promise.resolve().then(() => duplex.ack());
    return opening;
  }
}

function duplexSession() {
  const clock = new FakeClock(settle);
  const transport = new DuplexTransport(clock);
  let dials = 0;
  const session = new EventsSession({
    subscriptions: [globalSubscription('pane.agent_detected')],
    connect: async () => {
      dials += 1;
      return transport;
    },
    clock,
    keepalive: null,
  });
  const next = async () => (await session.updates.next()).value;
  return { clock, transport, session, next, dials: () => dials };
}

describe('EventsSession over a streamlocal channel', () => {
  it('connects, delivers decoded events, and recovers from a remote close', async () => {
    const { clock, transport, session, next } = duplexSession();
    await session.resume();
    expect(await next()).toEqual({ type: 'status', status: { kind: 'connecting' } });
    expect(await next()).toEqual({ type: 'status', status: { kind: 'connected' } });

    transport.duplexes[0]?.send(event('pane_agent_detected', { pane_id: 'p9' }));
    expect(await next()).toEqual({
      type: 'event',
      event: { kind: 'pane.agent_detected', data: { pane_id: 'p9' } },
    });

    transport.duplexes[0]?.remoteClose();
    expect(await next()).toMatchObject({ status: { kind: 'reconnecting', attempt: 1 } });
    await clock.advance(1_000);
    expect(await next()).toEqual({ type: 'status', status: { kind: 'connected' } });
    expect(transport.duplexes).toHaveLength(2);
    await session.end();
    expect(transport.duplexes[1]?.closed).toBe(true);
  });

  it('holds suspend() for at most 2 s on a stalled channel close, then resumes', async () => {
    const { clock, transport, session, next } = duplexSession();
    await session.resume();
    expect(await next()).toMatchObject({ status: { kind: 'connecting' } });
    expect(await next()).toMatchObject({ status: { kind: 'connected' } });
    if (transport.duplexes[0]) transport.duplexes[0].hangClose = true;

    let suspended = false;
    void session.suspend().then(() => {
      suspended = true;
    });
    await clock.advance(CHANNEL_CLOSE_TIMEOUT_MS - 1);
    expect(suspended).toBe(false);
    await clock.advance(1);
    expect(suspended).toBe(true);
    expect(await next()).toEqual({ type: 'status', status: { kind: 'suspended' } });

    await session.resume();
    expect(await next()).toMatchObject({ status: { kind: 'connecting' } });
    expect(await next()).toMatchObject({ status: { kind: 'connected' } });
    await session.end();
  });

  it('redials when a resubscribe write never settles', async () => {
    const { clock, transport, session, next, dials } = duplexSession();
    await session.resume();
    expect(await next()).toMatchObject({ status: { kind: 'connecting' } });
    expect(await next()).toMatchObject({ status: { kind: 'connected' } });

    transport.prepareNext = (duplex) => {
      duplex.hangWrites = true;
    };
    await session.updateSubscriptions([
      globalSubscription('pane.agent_detected'),
      paneSubscription('pane.agent_status_changed', 'w1:p1'),
    ]);
    await clock.advance(14_999);
    expect(session.updates.size).toBe(0);
    await clock.advance(1);
    expect(await next()).toMatchObject({
      status: { kind: 'reconnecting', attempt: 1, failure: { kind: 'timedOut' } },
    });
    expect(transport.duplexes[1]?.closed).toBe(true);
    await clock.advance(1_000);
    expect(await next()).toMatchObject({ status: { kind: 'connected' } });
    expect(dials()).toBe(2);
    await session.end();
  });
});
