import { BoundedQueue } from './bounded-queue';
import { failures, failWith, type TransportFailure } from './failure';
import type { PingInfo } from './protocol';
import type { EventsTransport } from './session-options';
import type { EventSubscription, HerdrEvent, HerdrEventStream } from './types';

/**
 * A one-shot gate for tests: records each entry, then holds the caller until
 * `open()`. `waitForEntry` proves a scripted call has started.
 */
export class CallGate {
  entryCount = 0;
  private isOpen = false;
  private waiters: (() => void)[] = [];
  private entryWaiters: { count: number; resume(): void }[] = [];

  async waitUntilOpen(): Promise<void> {
    this.entryCount += 1;
    const reached = this.entryWaiters.filter((waiter) => this.entryCount >= waiter.count);
    this.entryWaiters = this.entryWaiters.filter((waiter) => this.entryCount < waiter.count);
    for (const waiter of reached) waiter.resume();
    if (this.isOpen) return;
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  waitForEntry(count = 1): Promise<void> {
    if (this.entryCount >= count) return Promise.resolve();
    return new Promise((resume) => this.entryWaiters.push({ count, resume }));
  }

  open(): void {
    this.isOpen = true;
    const waiters = this.waiters;
    this.waiters = [];
    for (const resume of waiters) resume();
  }
}

/**
 * A Transport whose answers a test scripts: ping failures by call ordinal,
 * gates on ping/subscribe/close, exited panes, a dead link, and an events
 * stream fed by `emit`.
 */
export class ScriptedEventsTransport implements EventsTransport {
  pingCount = 0;
  isClosed = false;
  readonly capturedSubscriptions: EventSubscription[][] = [];
  private alive = true;
  private readonly pingFailures = new Map<number, TransportFailure>();
  private pingGate: CallGate | undefined;
  private subscriptionGate: CallGate | undefined;
  private closeGate: CallGate | undefined;
  private missingPanes = new Set<string>();
  private live: { id: number; events: BoundedQueue<HerdrEvent> } | undefined;
  private nextStreamId = 0;

  constructor(
    readonly info: PingInfo = { version: 'scripted', protocolVersion: 17 },
    readonly routeId?: string,
  ) {}

  /** Makes the `ordinal`-th ping (1-based) throw `failure`. */
  failPing(ordinal: number, failure: TransportFailure): void {
    this.pingFailures.set(ordinal, failure);
  }

  gateNextPing(gate: CallGate): void {
    this.pingGate = gate;
  }

  /** Parks the next subscribe after recording its set. */
  gateNextSubscription(gate: CallGate): void {
    this.subscriptionGate = gate;
  }

  gateNextClose(gate: CallGate): void {
    this.closeGate = gate;
  }

  /** herdr rejects a whole subscribe when one pane entry names an exited pane. */
  setMissingPanes(paneIds: Iterable<string>): void {
    this.missingPanes = new Set(paneIds);
  }

  /** A degraded link its events reader has not reported yet. */
  setConnectionAlive(alive: boolean): void {
    this.alive = alive;
  }

  /** Pushes one event onto the live stream; false if none is live. */
  emit(event: HerdrEvent): boolean {
    if (!this.live) return false;
    this.live.events.push(event);
    return true;
  }

  /** Kills the live stream as a remotely dropped channel would. */
  failEventStream(failure: TransportFailure): void {
    this.live?.events.finish(failWith(failure));
    this.live = undefined;
  }

  get hasLiveStream(): boolean {
    return this.live !== undefined;
  }

  async ping(): Promise<PingInfo> {
    if (!this.alive) throw failWith(failures.sshUnreachable('connection is dead'));
    this.pingCount += 1;
    const failure = this.pingFailures.get(this.pingCount);
    const gate = this.pingGate;
    this.pingGate = undefined;
    await gate?.waitUntilOpen();
    if (failure) throw failWith(failure);
    return this.info;
  }

  isConnected(): boolean {
    return this.alive && !this.isClosed;
  }

  async subscribeToEvents(subscriptions: readonly EventSubscription[]): Promise<HerdrEventStream> {
    if (this.live) throw failWith(failures.eventsChannelAlreadyOpen());
    this.capturedSubscriptions.push([...subscriptions]);
    const gate = this.subscriptionGate;
    this.subscriptionGate = undefined;
    await gate?.waitUntilOpen();
    const missing = subscriptions.find(
      (entry) => entry.scope === 'pane' && this.missingPanes.has(entry.paneId),
    );
    if (missing?.scope === 'pane') {
      throw failWith(failures.apiRejected('pane_not_found', `pane ${missing.paneId} not found`));
    }
    this.nextStreamId += 1;
    const id = this.nextStreamId;
    const events = new BoundedQueue<HerdrEvent>();
    this.live = { id, events };
    return { events, end: async () => this.endStream(id) };
  }

  async close(): Promise<void> {
    const gate = this.closeGate;
    this.closeGate = undefined;
    await gate?.waitUntilOpen();
    this.isClosed = true;
    this.live?.events.finish();
    this.live = undefined;
  }

  private endStream(id: number): void {
    if (this.live?.id !== id) return;
    this.live.events.finish();
    this.live = undefined;
  }
}

/** Hands transports to `connect` in order (the last one repeats) and counts dials. */
export class SequencedConnector<T> {
  connectCount = 0;

  constructor(private readonly transports: readonly T[]) {
    if (transports.length === 0) throw new RangeError('SequencedConnector needs a transport');
  }

  connect = async (): Promise<T> => {
    const transport = this.transports[Math.min(this.connectCount, this.transports.length - 1)] as T;
    this.connectCount += 1;
    return transport;
  };
}
