import { asTransportError, isRetryable, type TransportError } from '../errors/transport-error';
import type { Clock } from '../hosts/cancellation';
import { EVENTS_DROPPED_EVENT, type EventSubscription, type HerdrEventStream } from '../wire';
import { BoundedQueue } from './bounded-queue';
import { type Sleep, sleep } from './clock';
import { failures, failWith, namesMissingPane } from './failure';
import {
  DEFAULT_KEEPALIVE_POLICY,
  DEFAULT_RECONNECT_POLICY,
  EVENTS_BUFFER_LIMIT,
  type KeepalivePolicy,
  type ReconnectPolicy,
  reconnectDelay,
} from './policies';
import { serverInfoFromPing } from './protocol';
import type { EventsSessionOptions, EventsTransport } from './session-options';
import { TerminalPermits } from './terminal-permits';
import { TransportWaiters } from './transport-waiters';
import {
  baselineSubscriptions,
  type EventsSessionUpdate,
  eventUpdate,
  statusUpdate,
} from './types';

export const noop = () => {};
const closeQuietly = (transport: EventsTransport) => transport.close().catch(noop);

/** How long a redial waits for a goodbye: a connection the network dropped never says it. */
export const CLOSE_WAIT_MS = 1_500;

/**
 * State, run loop, transport installation, keepalive and teardown of
 * `EventsSession` (the public surface lives there).
 */
export abstract class EventsSessionCore<T extends EventsTransport> {
  /** Status transitions and events, in order. Finishes after `end()`. */
  readonly updates: BoundedQueue<EventsSessionUpdate>;
  /** Ping round trips (ms) on the live connection: latest-value telemetry. */
  readonly latencyUpdates = new BoundedQueue<number>(1);
  /** Installed, ping-proven Transport generations (terminals recover on these). */
  readonly terminalTransportGenerations = new BoundedQueue<number>(1);
  /** Updates the bounded buffer shed (each one covered by a drop marker). */
  droppedUpdateCount = 0;
  /** Identity of the installed Transport; a same-connection resubscribe keeps it. */
  transportGeneration = 0;

  protected latency: number | undefined;
  protected routeId: string | undefined;
  protected subscriptions: EventSubscription[];
  protected readonly onTerminalWaiterRegistered: () => void;
  private readonly connect: () => Promise<T>;
  private readonly clock: Clock;
  private readonly reconnectPolicy: ReconnectPolicy;
  private readonly keepalivePolicy: KeepalivePolicy | null;

  protected phase: 'suspended' | 'active' | 'ended' = 'suspended';
  protected currentTransport: T | undefined;
  /** The connection cannot be trusted even if it looks alive: redial next. */
  protected transportSuspect = false;
  /** The live channel was ended on purpose: re-subscribe, no backoff. */
  protected resubscribeRequested = false;
  protected liveStream: HerdrEventStream | undefined;
  protected activationGeneration = 0;
  protected runTask: Promise<void> | undefined;
  /** An action-required failure, sticky until the next activation. */
  protected terminalTransportFailure: TransportError | undefined;
  protected isWindingDown = false;
  protected readonly permits = new TerminalPermits();
  protected readonly waiters = new TransportWaiters<T>();
  private hasEstablishedTransport = false;
  private pendingKeepaliveFailure: TransportError | undefined;
  /** Last proof of life: a connect ping, an RPC, an event, a keepalive answer. */
  private lastActivity: number | undefined;
  private keepaliveStop: (() => void) | undefined;
  /**
   * Distrusted Transports awaiting their explicit close. Swift drops them
   * and lets `deinit` close the connection; JS has no deinit, so the next
   * redial (or teardown) closes them.
   */
  private retired: T[] = [];
  private backoff: Sleep | undefined;

  constructor(options: EventsSessionOptions<T>) {
    this.subscriptions = [...options.subscriptions];
    this.connect = options.connect;
    this.clock = options.clock;
    this.reconnectPolicy = options.reconnect ?? DEFAULT_RECONNECT_POLICY;
    this.keepalivePolicy =
      options.keepalive === undefined ? DEFAULT_KEEPALIVE_POLICY : options.keepalive;
    this.onTerminalWaiterRegistered = options.onTerminalWaiterRegistered ?? noop;
    this.updates = new BoundedQueue(options.updatesBufferLimit ?? EVENTS_BUFFER_LIMIT);
  }

  /**
   * The single gate every update leaves through. Clears the connection-scoped
   * latency before any non-`connected` status; follows a shed update with the
   * drop marker (a shed marker re-arms itself the same way).
   */
  protected yieldUpdate(update: EventsSessionUpdate): void {
    if (update.type === 'status' && update.status.kind !== 'connected') {
      this.latency = undefined;
      this.routeId = undefined;
    }
    if (this.updates.push(update) !== 'dropped') return;
    this.droppedUpdateCount += 1;
    if (this.updates.push(eventUpdate(EVENTS_DROPPED_EVENT)) === 'dropped')
      this.droppedUpdateCount += 1;
  }

  protected startRun(generation: number): void {
    // Started on a later turn, like a spawned task, never inside the caller.
    // `run` handles its own failures; the catch only guards a throwing `end()`.
    this.runTask = Promise.resolve()
      .then(() => this.run(generation))
      .catch(noop);
  }

  protected noteActivity(): void {
    this.lastActivity = this.clock.monotonicMs();
  }

  /**
   * One activation's lifetime: connect, subscribe, stream, and reconnect with
   * bounded backoff until the phase or generation changes. A stale run (an
   * SSH call that ignored teardown) can never install into a newer one.
   */
  private async run(generation: number): Promise<void> {
    let attempt = 0;
    while (this.isCurrent(generation)) {
      let stream: HerdrEventStream;
      try {
        const transport = await this.ensureTransport(generation);
        if (!this.isCurrent(generation)) break;
        stream = await transport.subscribeToEvents(this.subscriptions);
      } catch (error) {
        if (!this.isCurrent(generation)) break;
        const failure = asTransportError(error);
        // A swallowed request: do not trust the connection for the retry.
        if (failure.kind === 'timedOut') this.transportSuspect = true;
        // A pane that exited since the snapshot is a race, not a failure.
        if (namesMissingPane(failure) && this.dropSnapshotSubscriptions()) continue;
        if (!isRetryable(failure)) return this.stopOn(failure, generation);
        attempt += 1;
        await this.reconnectAfter(failure, attempt);
        continue;
      }
      if (!this.isCurrent(generation)) {
        await stream.end();
        break;
      }
      // Distrusted while the subscribe was in flight: nothing to park on.
      if (this.transportSuspect || !this.currentTransport) {
        await stream.end();
        continue;
      }
      this.liveStream = stream;
      attempt = 0;
      this.pendingKeepaliveFailure = undefined;
      this.yieldUpdate(statusUpdate({ kind: 'connected' }));
      this.startKeepalive(stream);

      let streamFailure: TransportError | undefined;
      try {
        for await (const event of stream.events) {
          // Late buffered events after teardown would land behind the
          // terminal status; `suspended`/`connected` already oblige a resync.
          if (!this.isCurrent(generation)) break;
          this.noteActivity();
          this.yieldUpdate(eventUpdate(event));
        }
      } catch (error) {
        streamFailure = asTransportError(error);
      }
      if (this.liveStream === stream) {
        this.stopKeepalive();
        this.liveStream = undefined;
      }
      if (!this.isCurrent(generation)) break;
      if (this.resubscribeRequested) {
        this.resubscribeRequested = false;
        continue;
      }
      const failure =
        this.pendingKeepaliveFailure ??
        streamFailure ??
        failures.channelFailed('events stream ended unexpectedly');
      this.pendingKeepaliveFailure = undefined;
      if (!isRetryable(failure)) return this.stopOn(failure, generation);
      attempt += 1;
      await this.reconnectAfter(failure, attempt);
    }
  }

  private stopOn(failure: TransportError, generation: number): void {
    if (!this.currentTransport) this.terminalTransportFailure = failure;
    this.waiters.failTerminal(failure, generation);
    this.waiters.failRpc(failure);
    this.yieldUpdate(statusUpdate({ kind: 'failed', failure }));
  }

  private async reconnectAfter(failure: TransportError, attempt: number): Promise<void> {
    this.waiters.failRpc(failure);
    this.dropSnapshotSubscriptions();
    const delayMs = reconnectDelay(this.reconnectPolicy, attempt);
    this.yieldUpdate(statusUpdate({ kind: 'reconnecting', attempt, delayMs, failure }));
    const backoff = sleep(this.clock, delayMs);
    this.backoff = backoff;
    await backoff.done;
    if (this.backoff === backoff) this.backoff = undefined;
  }

  /** Drops snapshot-derived entries; returns whether the set changed. */
  private dropSnapshotSubscriptions(): boolean {
    const baseline = baselineSubscriptions(this.subscriptions);
    if (baseline.length === this.subscriptions.length) return false;
    this.subscriptions = baseline;
    return true;
  }

  private isCurrent(generation: number): boolean {
    return this.phase === 'active' && this.activationGeneration === generation;
  }

  /**
   * Reuses the current Transport while alive and trusted; otherwise closes
   * it, dials a fresh one and pings it (the floor check) before installing.
   */
  private async ensureTransport(generation: number): Promise<T> {
    const cancelled = () => failWith(failures.cancelled());
    if (!this.isCurrent(generation)) throw cancelled();
    const existing = this.currentTransport;
    if (existing) {
      if (!this.transportSuspect && (await existing.isConnected())) return existing;
      this.currentTransport = undefined;
      await closeQuietly(existing);
    }
    await this.closeRetired();
    const transport = await this.connect();
    try {
      if (!this.isCurrent(generation)) throw cancelled();
      const latency = await this.measureLatency(transport);
      if (!this.isCurrent(generation)) throw cancelled();
      this.publishLatency(latency);
      this.routeId = transport.routeId;
    } catch (error) {
      await closeQuietly(transport);
      throw error;
    }
    this.transportSuspect = false;
    this.terminalTransportFailure = undefined;
    this.noteActivity();
    this.currentTransport = transport;
    if (this.hasEstablishedTransport) this.transportGeneration += 1;
    else this.hasEstablishedTransport = true;
    this.terminalTransportGenerations.push(this.transportGeneration);
    this.waiters.resume(transport, generation, this.transportGeneration);
    return transport;
  }

  /**
   * Ends the activation and closes everything. A stalled run is not awaited
   * (an SSH call may ignore teardown); generation checks make it harmless.
   */
  protected async windDown(): Promise<void> {
    this.isWindingDown = true;
    this.waiters.failTerminal(failures.cancelled());
    this.waiters.failRpc(failures.cancelled());
    this.backoff?.cancel();
    this.backoff = undefined;
    this.stopKeepalive();
    this.runTask = undefined;
    const stream = this.liveStream;
    this.liveStream = undefined;
    // End the channel before closing the connection it rides on.
    if (stream) await stream.end();
    const transport = this.currentTransport;
    if (transport) {
      this.currentTransport = undefined;
      await this.boundedClose(closeQuietly(transport));
    }
    await this.closeRetired();
    await this.permits.waitForIdle();
    this.transportSuspect = false;
    this.pendingKeepaliveFailure = undefined;
    this.resubscribeRequested = false;
    this.lastActivity = undefined;
    this.terminalTransportFailure = undefined;
    this.dropSnapshotSubscriptions();
    this.isWindingDown = false;
  }

  /**
   * Marks `transport` suspect while it is still installed and ends the live
   * channel as a deliberate resubscribe, so the run loop redials silently.
   */
  protected async distrust(transport: T): Promise<void> {
    if (this.currentTransport !== transport) return;
    this.transportSuspect = true;
    this.currentTransport = undefined;
    this.retired.push(transport);
    const stream = this.liveStream;
    if (!stream) return;
    this.resubscribeRequested = true;
    await stream.end();
  }

  private async closeRetired(): Promise<void> {
    const retired = this.retired;
    this.retired = [];
    for (const transport of retired) await this.boundedClose(closeQuietly(transport));
  }

  /** The close goes on by itself past the wait; nobody needs its answer. */
  private boundedClose(closing: Promise<unknown>): Promise<void> {
    return new Promise((resolve) => {
      const timer = this.clock.setTimeout(resolve, CLOSE_WAIT_MS);
      void closing.finally(() => {
        this.clock.clearTimeout(timer);
        resolve();
      });
    });
  }

  // MARK: Keepalive and latency

  private startKeepalive(stream: HerdrEventStream): void {
    const policy = this.keepalivePolicy;
    const transport = this.currentTransport;
    if (!policy || !transport) return;
    let stopped = false;
    let pause: Sleep | undefined;
    this.keepaliveStop = () => {
      stopped = true;
      pause?.cancel();
    };
    const loop = async () => {
      while (!stopped) {
        pause = sleep(this.clock, policy.intervalMs);
        await pause.done;
        if (stopped) break;
        if (!this.isIdle(policy.intervalMs)) continue;
        try {
          const latency = await this.measureLatency(transport);
          // An answer after this channel was replaced keeps a dead connection alive.
          if (!this.publishLatencyOn(latency, stream)) break;
          this.noteActivity();
        } catch (error) {
          const failure = asTransportError(error);
          if (failure.kind !== 'cancelled') await this.keepaliveDidFail(failure, stream);
          break;
        }
      }
    };
    void loop();
  }

  private stopKeepalive(): void {
    this.keepaliveStop?.();
    this.keepaliveStop = undefined;
  }

  private isIdle(intervalMs: number): boolean {
    return (
      this.lastActivity === undefined || this.clock.monotonicMs() - this.lastActivity >= intervalMs
    );
  }

  /** A failed liveness ping: distrust the connection and end the channel. */
  protected async keepaliveDidFail(
    failure: TransportError,
    stream: HerdrEventStream,
  ): Promise<void> {
    if (this.phase !== 'active' || this.liveStream !== stream) return;
    this.transportSuspect = true;
    this.pendingKeepaliveFailure = failure;
    await stream.end();
  }

  /** Times only herdr's `ping` (not SSH setup) and applies the protocol floor. */
  protected async measureLatency(transport: T): Promise<number> {
    const started = this.clock.monotonicMs();
    serverInfoFromPing(await transport.ping());
    return this.clock.monotonicMs() - started;
  }

  /** Publishes a sample taken on `stream` unless that channel is gone. */
  protected publishLatencyOn(latency: number, stream: HerdrEventStream): boolean {
    if (this.phase !== 'active' || this.liveStream !== stream) return false;
    this.publishLatency(latency);
    return true;
  }

  private publishLatency(latency: number): void {
    this.latency = latency;
    this.latencyUpdates.push(latency);
  }
}
