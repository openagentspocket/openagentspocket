import {
  type Cancellation,
  CancelledError,
  type CancelSignal,
  type Clock,
  createCancellation,
} from './cancellation';
import { isDirectRoute, type SSHRoute } from './ssh-route';

/** How long deferred routes wait while a direct route is still trying. */
export const ROUTE_RACE_STAGGER_MS = 400;

/** Every attempt failed; `failures` holds each error in attempt order. */
export class RouteRaceFailure extends Error {
  constructor(readonly failures: readonly unknown[]) {
    super('no route reached the Host');
    this.name = 'RouteRaceFailure';
  }
}

export interface RaceOptions<T> {
  readonly count: number;
  isDeferred(index: number): boolean;
  /** Defaults to `ROUTE_RACE_STAGGER_MS`. */
  readonly staggerMs?: number;
  /** One attempt; `signal` aborts when another attempt wins or the caller cancels. */
  attempt(index: number, signal: CancelSignal): Promise<T>;
  /** Receives a value that arrived after the race was decided (close the connection). */
  discard(value: T): void | Promise<void>;
  readonly clock: Clock;
  /** The caller's cancellation; the race then rejects with `CancelledError`. */
  readonly signal?: CancelSignal;
}

type Outcome<T> =
  | { kind: 'won'; index: number; value: T }
  | { kind: 'failed' }
  | { kind: 'cancelled' };

/**
 * Races attempts: the first to succeed wins and every other is cancelled.
 * Immediate attempts start at once; deferred ones start after the stagger, or
 * as soon as every immediate attempt has failed, so a reachable LAN address
 * wins without a Jump Host ever being dialled, and an unreachable one costs
 * only the stagger. The winner resolves without waiting for losers to unwind;
 * an attempt that succeeds after the race is decided goes to `discard`.
 */
export function raceFirst<T>(options: RaceOptions<T>): Promise<{ index: number; value: T }> {
  return new Promise((resolve, reject) => {
    const { count, clock, signal } = options;
    if (signal?.aborted) {
      reject(new CancelledError());
      return;
    }
    const immediate: number[] = [];
    const deferred: number[] = [];
    for (let index = 0; index < count; index++) {
      (options.isDeferred(index) ? deferred : immediate).push(index);
    }
    const running = new Map<number, Cancellation>();
    const failures = new Map<number, unknown>();
    let decided = false;
    let deferredStarted = false;
    let timer: unknown = null;

    const stopTimer = () => {
      if (timer !== null) clock.clearTimeout(timer);
      timer = null;
    };
    const onAbort = () => decide({ kind: 'cancelled' });

    function decide(outcome: Outcome<T>): void {
      if (decided) return;
      decided = true;
      stopTimer();
      signal?.removeEventListener('abort', onAbort);
      for (const [index, cancellation] of running) {
        if (outcome.kind !== 'won' || outcome.index !== index) cancellation.cancel();
      }
      if (outcome.kind === 'won') resolve({ index: outcome.index, value: outcome.value });
      else if (outcome.kind === 'cancelled') reject(new CancelledError());
      else reject(new RouteRaceFailure([...Array(count).keys()].map((i) => failures.get(i))));
    }

    function startDeferred(): void {
      if (decided || deferredStarted) return;
      deferredStarted = true;
      stopTimer();
      for (const index of deferred) launch(index);
    }

    function failed(index: number, error: unknown): void {
      if (decided) return;
      failures.set(index, error);
      if (failures.size === count) decide({ kind: 'failed' });
      // Nothing direct is left to wait for.
      else if (immediate.every((i) => failures.has(i))) startDeferred();
    }

    function launch(index: number): void {
      const cancellation = createCancellation();
      running.set(index, cancellation);
      let attempt: Promise<T>;
      try {
        attempt = Promise.resolve(options.attempt(index, cancellation.signal));
      } catch (error) {
        attempt = Promise.reject(error);
      }
      attempt.then(
        (value) => {
          if (!decided) decide({ kind: 'won', index, value });
          else Promise.resolve(options.discard(value)).catch(() => undefined);
        },
        (error: unknown) => failed(index, error),
      );
    }

    signal?.addEventListener('abort', onAbort, { once: true });
    if (count === 0) {
      decide({ kind: 'failed' });
      return;
    }
    for (const index of immediate) launch(index);
    if (immediate.length === 0) startDeferred();
    else if (deferred.length > 0) {
      timer = clock.setTimeout(() => {
        timer = null;
        startDeferred();
      }, options.staggerMs ?? ROUTE_RACE_STAGGER_MS);
    }
  });
}

/**
 * Races a Host's routes as the transport does: when any route is direct, the
 * Jump Host routes wait for the stagger. Rejects with `RouteRaceFailure`
 * (pair its failures with `routeFailures`) or `CancelledError`.
 */
export function raceRoutes<T>(
  routes: readonly SSHRoute[],
  options: Omit<RaceOptions<T>, 'count' | 'isDeferred' | 'attempt'> & {
    attempt(route: SSHRoute, signal: CancelSignal): Promise<T>;
  },
): Promise<{ index: number; value: T }> {
  const hasDirectRoute = routes.some(isDirectRoute);
  return raceFirst({
    ...options,
    count: routes.length,
    isDeferred: (index) => hasDirectRoute && !isDirectRoute(routes[index] as SSHRoute),
    attempt: (index, signal) => options.attempt(routes[index] as SSHRoute, signal),
  });
}
