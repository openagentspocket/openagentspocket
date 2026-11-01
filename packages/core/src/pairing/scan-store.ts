import {
  PairingCancelledError,
  PairingCeremonyError,
  type PairingResult,
  type PairingStep,
} from './ceremony';
import { decodePairingCode, type PairingCode, withoutBootstrap } from './code';
import { describeError, type PairingConnector, type PairingDeviceKey } from './connector';
import {
  ceremonyFailure,
  deviceKeyLockedFailure,
  deviceKeyUnavailableFailure,
  expiredCodeFailure,
  type PairingFailure,
  type PairingMessage,
  saveFailedFailure,
  scanFailureMessage,
  unexpectedFailure,
} from './failure';
import {
  findPairedTwin,
  missingRoutes,
  type PairingHostCatalog,
  pairedAddresses,
} from './host-catalog';

/** Loading this device's key: `locked` when the user did not confirm (retryable). */
export type PairingDeviceKeyLoad =
  | { readonly ok: true; readonly key: PairingDeviceKey }
  | { readonly ok: false; readonly reason: 'locked' | 'unavailable' };

export interface PairingScanState {
  /** Set once a scan parses; further scans are ignored until `rescan()`. */
  readonly pairingCode: PairingCode | null;
  /** The last failed scan's message (the parse step). Cleared by a good scan or `rescan()`. */
  readonly scanFailure: PairingMessage | null;
  readonly isPairing: boolean;
  /** The ceremony step underway, for progress UI. */
  readonly step: PairingStep | null;
  /** The last attempt's failure, with its recovery options. */
  readonly failure: PairingFailure | null;
  /** The saved Host's id, set only after the verified reconnect and a successful save. */
  readonly pairedHostId: string | null;
}

export interface PairingScanStoreOptions {
  readonly connector: PairingConnector;
  readonly catalog: PairingHostCatalog;
  readonly loadDeviceKey: () => Promise<PairingDeviceKeyLoad>;
  /** Milliseconds since the epoch. */
  readonly now?: () => number;
}

const INITIAL: PairingScanState = {
  pairingCode: null,
  scanFailure: null,
  isPairing: false,
  step: null,
  failure: null,
  pairedHostId: null,
};

/**
 * Drives Scan to Pair: turns a scanned or pasted string into a Pairing Code,
 * runs the ceremony through the injected connector, and saves the Host only
 * after the verified reconnect, with its fingerprint pinned. Framework-free:
 * `getState`/`subscribe` fit React's `useSyncExternalStore`.
 */
export class PairingScanStore {
  private state: PairingScanState = INITIAL;
  private readonly listeners = new Set<() => void>();
  /** The next attempt's code: the scanned one, minus the Bootstrap Key after a verify failure. */
  private attemptCode: PairingCode | null = null;
  /** A bootstrap ceremony reached Enrollment, so later verify failures keep the "enrolled" copy. */
  private enrolledViaBootstrap = false;
  /** Invalidates step callbacks still in flight from earlier attempts. */
  private generation = 0;
  private cancellation = { aborted: false };
  private readonly now: () => number;

  constructor(private readonly options: PairingScanStoreOptions) {
    this.now = options.now ?? Date.now;
  }

  getState = (): PairingScanState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<PairingScanState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** A scan or a paste: the same parse path, trimmed so a trailing newline cannot disagree. */
  submit(scanned: string): void {
    if (this.state.pairingCode !== null) return;
    const decoded = decodePairingCode(scanned.trim());
    if (!decoded.ok) {
      this.set({ scanFailure: scanFailureMessage(decoded.error) });
      return;
    }
    this.attemptCode = decoded.code;
    this.enrolledViaBootstrap = false;
    this.set({ pairingCode: decoded.code, scanFailure: null });
  }

  /**
   * One ceremony attempt. Does nothing while one runs or after one succeeded;
   * calling it again after a retryable failure is the Try Again action.
   */
  async pair(): Promise<void> {
    const code = this.attemptCode;
    if (code === null || this.state.isPairing || this.state.pairedHostId !== null) return;
    const generation = ++this.generation;
    const cancellation = { aborted: false };
    this.cancellation = cancellation;
    this.set({ isPairing: true, failure: null });
    let outcome: Partial<PairingScanState> = {};
    try {
      outcome = await this.attempt(code, generation, cancellation);
    } finally {
      if (generation === this.generation) this.set({ ...outcome, isPairing: false, step: null });
    }
  }

  /** Back to a fresh scanning state (Scan Again). Ignored while an attempt runs. */
  rescan(): void {
    if (this.state.isPairing) return;
    this.attemptCode = null;
    this.enrolledViaBootstrap = false;
    this.set(INITIAL);
  }

  /** Abandons the running attempt (the scan sheet went away); it ends without a failure. */
  cancel(): void {
    this.cancellation.aborted = true;
  }

  private async attempt(
    code: PairingCode,
    generation: number,
    cancellation: { aborted: boolean },
  ): Promise<Partial<PairingScanState>> {
    if (code.bootstrap !== null && code.bootstrap.expiresAt * 1000 <= this.now()) {
      // Locally detectable expiry: skip the doomed connection.
      return { failure: expiredCodeFailure() };
    }
    const load = await this.options
      .loadDeviceKey()
      .catch((): PairingDeviceKeyLoad => ({ ok: false, reason: 'unavailable' }));
    if (!load.ok) {
      return {
        failure:
          load.reason === 'locked' ? deviceKeyLockedFailure() : deviceKeyUnavailableFailure(),
      };
    }

    let result: PairingResult;
    try {
      const onStep = (step: PairingStep) => {
        if (generation === this.generation && this.state.isPairing) this.set({ step });
      };
      result = await this.options.connector.pair(code, load.key, onStep, cancellation);
    } catch (error) {
      if (error instanceof PairingCancelledError) return {};
      if (!(error instanceof PairingCeremonyError)) {
        return { failure: unexpectedFailure(describeError(error)) };
      }
      if (error.failure.kind === 'verificationFailed' && code.bootstrap !== null) {
        // Enrollment already landed: the retry repeats only the Device Key reconnect.
        this.attemptCode = withoutBootstrap(code);
        this.enrolledViaBootstrap = true;
      }
      const isConfigOnly = code.bootstrap === null && !this.enrolledViaBootstrap;
      return { failure: ceremonyFailure(error.failure, isConfigOnly) };
    }
    return this.save(result, code);
  }

  /** Only a fully verified ceremony saves a Host; the endpoint comes from the scanned code. */
  private async save(result: PairingResult, code: PairingCode): Promise<Partial<PairingScanState>> {
    const { catalog } = this.options;
    const addresses = pairedAddresses(result, code);
    try {
      const twin = await findPairedTwin(catalog, result, code.endpoint);
      if (twin !== null) {
        await catalog.addRoutes(twin.id, missingRoutes(twin, addresses, result.port));
        return { pairedHostId: twin.id };
      }
      const hostId = await catalog.addHost({
        username: result.username,
        port: result.port,
        addresses,
        endpoint: code.endpoint,
        hostKeyFingerprint: result.hostKeyFingerprint,
      });
      return { pairedHostId: hostId };
    } catch {
      return { failure: saveFailedFailure() };
    }
  }
}
