import { failWith } from '../events/failure';
import type { Clock } from './cancellation';
import type { Host } from './host';

/** How long one confirmation covers further key use, so several Hosts connect on one prompt. */
export const KEY_ACCESS_REUSE_MS = 10_000;

export type KeyAccessResult = 'success' | 'denied' | 'cancelled' | 'unavailable';

export interface KeyAccessGateOptions {
  /** The owner turned Require Face ID for SSH Keys on. */
  readonly isRequired: () => boolean;
  readonly authenticate: () => Promise<KeyAccessResult>;
  readonly clock: Clock;
}

/** A password is not a key: the gate guards the Device Key and RSA Keys only. */
export function hostUsesKey(host: Pick<Host, 'authMethod'>): boolean {
  return host.authMethod !== 'password';
}

/**
 * The one place a new connection asks before it uses a Device Key or an RSA Key. It is the app's
 * policy, not a Keychain access control. A device without a passcode cannot ask, so it stands open.
 */
export class KeyAccessGate {
  private confirmedAt: number | undefined;
  private asking: Promise<void> | undefined;

  constructor(private readonly options: KeyAccessGateOptions) {}

  /** Resolves when a key may be used; fails with `keyAccessNotConfirmed` when it may not. */
  authorize(): Promise<void> {
    if (!this.options.isRequired() || this.isConfirmed()) return Promise.resolve();
    this.asking ??= this.ask().finally(() => {
      this.asking = undefined;
    });
    return this.asking;
  }

  /** Whether `authorize` would have to prompt, so a caller without a window can hold it back. */
  wouldAsk(): boolean {
    return this.options.isRequired() && !this.isConfirmed();
  }

  private isConfirmed(): boolean {
    if (this.confirmedAt === undefined) return false;
    return this.options.clock.monotonicMs() - this.confirmedAt < KEY_ACCESS_REUSE_MS;
  }

  private async ask(): Promise<void> {
    const result = await this.options.authenticate();
    if (result === 'denied' || result === 'cancelled') {
      throw failWith({ kind: 'keyAccessNotConfirmed' });
    }
    if (result === 'success') this.confirmedAt = this.options.clock.monotonicMs();
  }
}
