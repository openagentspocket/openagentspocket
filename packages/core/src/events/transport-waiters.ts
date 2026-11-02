import type { TransportError } from '../errors/transport-error';
import type { CancelSignal } from '../hosts/cancellation';
import { onAbort } from './clock';
import { failures, failWith } from './failure';

/** A ping-proven Transport handed to a terminal, pinned to its activation. */
export interface TerminalTransportReady<T> {
  readonly transport: T;
  readonly activationGeneration: number;
  readonly transportGeneration: number;
}

interface Waiter<V> {
  resolve(value: V): void;
  reject(error: unknown): void;
  detach(): void;
}

interface TerminalWaiter<T> extends Waiter<TerminalTransportReady<T>> {
  /**
   * Undefined: registered while suspended, belongs to the next activation.
   * Otherwise pinned, so a retry or a background teardown can never hand it
   * a later activation's Transport by accident.
   */
  readonly activationGeneration: number | undefined;
}

/**
 * Callers parked until the events session installs its next Transport: RPCs
 * (`withTransport`) and terminals (`withTerminalTransport`). Every run-loop
 * exit releases them with the real cause.
 */
export class TransportWaiters<T> {
  // Mutated in place only: abort handlers hold these exact arrays.
  private readonly rpc: Waiter<T>[] = [];
  private readonly terminal: TerminalWaiter<T>[] = [];

  get rpcCount(): number {
    return this.rpc.length;
  }

  get terminalCount(): number {
    return this.terminal.length;
  }

  waitForTransport(signal?: CancelSignal): Promise<T> {
    return this.park(this.rpc, signal, (base) => base);
  }

  waitForTerminal(
    activationGeneration: number | undefined,
    signal?: CancelSignal,
  ): Promise<TerminalTransportReady<T>> {
    return this.park(this.terminal, signal, (base) => ({ ...base, activationGeneration }));
  }

  /** Hands a freshly installed Transport to every waiter it belongs to. */
  resume(transport: T, activationGeneration: number, transportGeneration: number): void {
    const ready = { transport, activationGeneration, transportGeneration };
    for (const waiter of this.terminal.splice(0)) {
      waiter.detach();
      const pinned = waiter.activationGeneration;
      if (pinned !== undefined && pinned !== activationGeneration) {
        waiter.reject(failWith(failures.cancelled()));
      } else {
        waiter.resolve(ready);
      }
    }
    for (const waiter of this.rpc.splice(0)) {
      waiter.detach();
      waiter.resolve(transport);
    }
  }

  failRpc(failure: TransportError): void {
    for (const waiter of this.rpc.splice(0)) {
      waiter.detach();
      waiter.reject(failWith(failure));
    }
  }

  /**
   * Fails terminal waiters; with `forActivation`, those pinned to another
   * activation are kept.
   */
  failTerminal(failure: TransportError, forActivation?: number): void {
    const kept: TerminalWaiter<T>[] = [];
    for (const waiter of this.terminal.splice(0)) {
      const pinned = waiter.activationGeneration;
      if (forActivation !== undefined && pinned !== undefined && pinned !== forActivation) {
        kept.push(waiter);
        continue;
      }
      waiter.detach();
      waiter.reject(failWith(failure));
    }
    this.terminal.push(...kept);
  }

  private park<V, W extends Waiter<V>>(
    list: W[],
    signal: CancelSignal | undefined,
    build: (base: Waiter<V>) => W,
  ): Promise<V> {
    if (signal?.aborted) return Promise.reject(failWith(failures.cancelled()));
    return new Promise<V>((resolve, reject) => {
      const waiter = build({
        resolve,
        reject,
        detach: onAbort(signal, () => {
          const index = list.indexOf(waiter);
          if (index === -1) return;
          list.splice(index, 1);
          reject(failWith(failures.cancelled()));
        }),
      });
      list.push(waiter);
    });
  }
}
