import { asTransportError } from '../errors/transport-error';
import type { CancelSignal } from '../hosts/cancellation';
import type { EventSubscription } from '../wire';
import { failures, failWith, isLinkFailure } from './failure';
import { EventsSessionCore, noop } from './session-core';
import type { EventsTransport } from './session-options';
import type { TerminalTarget } from './terminal-permits';
import type { TerminalTransportReady } from './transport-waiters';
import { sameSubscriptions, statusUpdate } from './types';

export type { EventsSessionOptions, EventsTransport } from './session-options';

/**
 * The self-healing events channel of one Host: owns the Host's Transport,
 * keeps its `events.subscribe` channel alive across network blips and
 * foreground/background transitions, and reports every transition.
 *
 * A dropped channel re-subscribes on the same connection; a dead or untrusted
 * connection (not connected, or a timed-out request) is closed and redialed,
 * then pinged (protocol floor 17) before re-subscribing. Retryable failures
 * back off 1 s, 2 s, 4 s ... capped at 30 s, without limit; action-required
 * ones stop on `failed`. Lifecycle calls (`resume`, `suspend`, `retry`,
 * `cancelConnecting`, `end`) serialize: one never sees another mid-teardown.
 *
 * `updates` has a single consumer and keeps the newest `updatesBufferLimit`
 * updates: overflow sheds the oldest and enqueues an `events_dropped` event,
 * so the consumer always learns it must resync. Terminal statuses are yielded
 * last, so they survive. Every `connected` obliges a fresh snapshot: herdr
 * does not replay events from before a subscription.
 */
export class EventsSession<T extends EventsTransport> extends EventsSessionCore<T> {
  private lifecycle: Promise<void> = Promise.resolve();

  /**
   * The round trip the current connection last proved, or undefined. Set
   * before the `connected` that follows a fresh ping and cleared before any
   * other status is yielded, so reading it while folding an update always
   * describes that update's own connection.
   */
  get currentLatency(): number | undefined {
    return this.latency;
  }

  /** The route the current connection reached; ordered like `currentLatency`. */
  get currentRouteId(): string | undefined {
    return this.routeId;
  }

  /** Activates the session (launch, foreground): `connecting`, then `connected`. */
  resume(): Promise<void> {
    return this.enqueue(() => this.activate());
  }

  /** Restarts the activation: after a `failed` stop, or as an explicit Reconnect. */
  retry(): Promise<void> {
    return this.enqueue(() => this.restart());
  }

  /** Deliberate teardown for backgrounding; no reconnect activity until `resume()`. */
  suspend(): Promise<void> {
    return this.enqueue(() => this.deactivate());
  }

  /** Stops a dial or backoff in flight and rests on `suspended`. A live channel stays. */
  cancelConnecting(): Promise<void> {
    return this.enqueue(async () => {
      if (!this.liveStream) await this.deactivate();
    });
  }

  /** Terminal teardown: like `suspend()`, then finishes `updates`. Idempotent. */
  end(): Promise<void> {
    return this.enqueue(() => this.finish());
  }

  /**
   * Re-proves a session that believes it is connected (call on foreground):
   * a failed ping takes the keepalive's path into a visible `reconnecting`,
   * or `failed` when herdr itself is gone. No-op unless a channel is live.
   */
  async revalidate(): Promise<void> {
    const stream = this.liveStream;
    const transport = this.currentTransport;
    if (this.phase !== 'active' || !stream || !transport) return;
    try {
      const latency = await this.measureLatency(transport);
      if (!this.publishLatencyOn(latency, stream)) return;
      this.noteActivity();
    } catch (error) {
      const failure = asTransportError(error);
      if (failure.kind !== 'cancelled') await this.keepaliveDidFail(failure, stream);
    }
  }

  /**
   * Replaces the subscription set (pane-scoped kinds come and go with panes).
   * A live channel is ended and re-subscribed at once on the same connection;
   * the fresh `connected` is the consumer's re-snapshot signal. Pane entries
   * last only until the next disconnect: reinstall after every `connected`.
   */
  async updateSubscriptions(subscriptions: readonly EventSubscription[]): Promise<void> {
    if (sameSubscriptions(this.subscriptions, subscriptions)) return;
    this.subscriptions = [...subscriptions];
    const stream = this.liveStream;
    if (this.phase !== 'active' || !stream) return;
    this.resubscribeRequested = true;
    await stream.end();
  }

  /**
   * Runs an RPC on the installed Transport. While the run loop silently
   * replaces it, callers wait for the replacement; a link failure distrusts
   * the Transport and retries once on the replacement.
   */
  withTransport<V>(operation: (transport: T) => Promise<V>, signal?: CancelSignal): Promise<V> {
    return this.runOnTransport(true, operation, signal);
  }

  /**
   * `withTransport` for a change on the Host that must not run twice: a link
   * failure still distrusts the Transport, but goes back to the caller.
   */
  withTransportRunningOnce<V>(
    operation: (transport: T) => Promise<V>,
    signal?: CancelSignal,
  ): Promise<V> {
    return this.runOnTransport(false, operation, signal);
  }

  /**
   * Runs one terminal lifetime with exclusive access to `target` (at most
   * five per Host) on this activation's ping-proven Transport; the events
   * subscription is not a prerequisite. A link failure redials at once so a
   * reattach rides the replacement.
   */
  async withTerminalTransport<V>(
    operation: (transport: T, transportGeneration: number) => Promise<V>,
    options: { target?: TerminalTarget; signal?: CancelSignal } = {},
  ): Promise<V> {
    const target = options.target ?? null;
    const signal = options.signal;
    await this.permits.acquire(target, signal);
    let acquired: T | undefined;
    try {
      if (signal?.aborted) throw failWith(failures.cancelled());
      const ready = await this.awaitTerminalTransport(signal);
      if (signal?.aborted || !this.isStillCurrent(ready)) throw failWith(failures.cancelled());
      acquired = ready.transport;
      const value = await operation(ready.transport, ready.transportGeneration);
      this.noteActivity();
      this.permits.release(target);
      return value;
    } catch (error) {
      this.permits.release(target);
      if (acquired && isLinkFailure(asTransportError(error))) await this.distrust(acquired);
      throw error;
    }
  }

  // MARK: Lifecycle

  /** Chains `transition` behind the previous one; call order is chain order. */
  private enqueue(transition: () => void | Promise<void>): Promise<void> {
    const next = this.lifecycle.then(transition);
    this.lifecycle = next.catch(noop);
    return next;
  }

  /** Every activation announces `connecting` before its run starts. */
  private activate(): void {
    if (this.phase !== 'suspended') return;
    this.phase = 'active';
    this.terminalTransportFailure = undefined;
    this.activationGeneration += 1;
    this.yieldUpdate(statusUpdate({ kind: 'connecting' }));
    this.startRun(this.activationGeneration);
  }

  /** `connecting` and the new generation precede teardown: no stale `connected` lingers. */
  private async restart(): Promise<void> {
    if (this.phase !== 'active') return this.activate();
    this.activationGeneration += 1;
    const generation = this.activationGeneration;
    this.yieldUpdate(statusUpdate({ kind: 'connecting' }));
    await this.windDown();
    if (this.phase !== 'active' || this.activationGeneration !== generation) return;
    this.startRun(generation);
  }

  private async deactivate(): Promise<void> {
    if (this.phase !== 'active') return;
    this.phase = 'suspended';
    await this.windDown();
    this.yieldUpdate(statusUpdate({ kind: 'suspended' }));
  }

  private async finish(): Promise<void> {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    await this.windDown();
    this.yieldUpdate(statusUpdate({ kind: 'ended' }));
    this.updates.finish();
    this.latencyUpdates.finish();
    this.terminalTransportGenerations.finish();
  }

  // MARK: Transport access

  private async runOnTransport<V>(
    retryingLinkFailure: boolean,
    operation: (transport: T) => Promise<V>,
    signal: CancelSignal | undefined,
  ): Promise<V> {
    const transport = await this.awaitUsableTransport(signal);
    try {
      const value = await operation(transport);
      this.noteActivity();
      return value;
    } catch (error) {
      // Server answers and cancellation are never retried.
      if (!isLinkFailure(asTransportError(error))) throw error;
      await this.distrust(transport);
      if (!retryingLinkFailure) throw error;
      // One retry on whatever is current; a replacement that times out too
      // surfaces the original cause instead of a second full wait.
      const replacement = await this.awaitUsableTransport(signal);
      try {
        const value = await operation(replacement);
        this.noteActivity();
        return value;
      } catch (retryError) {
        if (asTransportError(retryError).kind === 'timedOut') throw error;
        throw retryError;
      }
    }
  }

  /** The installed Transport or, while the active run loop installs one, the next. */
  private awaitUsableTransport(signal: CancelSignal | undefined): Promise<T> {
    if (this.currentTransport) return Promise.resolve(this.currentTransport);
    if (this.phase !== 'active' || this.isWindingDown || !this.runTask) {
      return Promise.reject(failWith(failures.sshUnreachable('The Host is not connected.')));
    }
    if (this.terminalTransportFailure) {
      return Promise.reject(failWith(this.terminalTransportFailure));
    }
    return this.waiters.waitForTransport(signal);
  }

  private awaitTerminalTransport(
    signal: CancelSignal | undefined,
  ): Promise<TerminalTransportReady<T>> {
    if (signal?.aborted || this.isWindingDown || this.phase === 'ended') {
      return Promise.reject(failWith(failures.cancelled()));
    }
    const transport = this.currentTransport;
    if (this.phase === 'active' && !this.transportSuspect && transport) {
      return Promise.resolve({
        transport,
        activationGeneration: this.activationGeneration,
        transportGeneration: this.transportGeneration,
      });
    }
    if (this.terminalTransportFailure) {
      return Promise.reject(failWith(this.terminalTransportFailure));
    }
    const pinned = this.phase === 'active' ? this.activationGeneration : undefined;
    const ready = this.waiters.waitForTerminal(pinned, signal);
    this.onTerminalWaiterRegistered();
    return ready;
  }

  private isStillCurrent(ready: TerminalTransportReady<T>): boolean {
    return (
      this.phase === 'active' &&
      !this.isWindingDown &&
      !this.transportSuspect &&
      this.activationGeneration === ready.activationGeneration &&
      this.transportGeneration === ready.transportGeneration &&
      this.currentTransport !== undefined
    );
  }
}
