import {
  failureStep,
  PairingCancelledError,
  PairingCeremonyError,
  type PairingCeremonyFailure,
  type PairingResult,
  type PairingStep,
} from './ceremony';
import type { PairingCode } from './code';
import type { PairingCancellation, PairingConnector, PairingDeviceKey } from './connector';

export type FakePairingOutcome =
  | { readonly succeeds: PairingResult }
  | { readonly fails: PairingCeremonyFailure }
  /** Anything else a connector might throw (a bug, a cancellation). */
  | { readonly throws: unknown };

/**
 * A scripted `PairingConnector` for store and screen tests: plays the
 * outcomes in order (the last one repeats), reports the steps the real
 * client would report before that outcome, and can hold every attempt open.
 * An attempt whose cancellation is aborted by the time it would finish
 * throws `PairingCancelledError`, as the real client does.
 */
export class FakePairingConnector implements PairingConnector {
  readonly capturedCodes: PairingCode[] = [];
  readonly capturedDeviceKeys: PairingDeviceKey[] = [];
  private holding = false;
  private waiters: (() => void)[] = [];

  constructor(private readonly outcomes: FakePairingOutcome[]) {
    if (outcomes.length === 0) throw new Error('script at least one outcome');
  }

  /** Makes each later attempt wait, after reporting its steps, until `release()`. */
  hold(): void {
    this.holding = true;
  }

  release(): void {
    this.holding = false;
    for (const resume of this.waiters.splice(0)) resume();
  }

  async pair(
    code: PairingCode,
    deviceKey: PairingDeviceKey,
    onStep: (step: PairingStep) => void,
    cancellation?: PairingCancellation,
  ): Promise<PairingResult> {
    this.capturedCodes.push(code);
    this.capturedDeviceKeys.push(deviceKey);
    const outcome = (this.outcomes.length > 1 ? this.outcomes.shift() : this.outcomes[0]) as
      | FakePairingOutcome
      | undefined;
    if (outcome === undefined) throw new Error('no outcome');
    for (const step of emittedSteps(outcome, code)) onStep(step);
    if (this.holding) await new Promise<void>((resume) => this.waiters.push(resume));
    if (cancellation?.aborted) throw new PairingCancelledError();
    if ('succeeds' in outcome) return outcome.succeeds;
    if ('fails' in outcome) throw new PairingCeremonyError(outcome.fails);
    throw outcome.throws;
  }
}

/**
 * Every ceremony step that begins at or before the outcome. `authenticate`
 * is never reported: authentication happens inside the reach connect.
 */
function emittedSteps(outcome: FakePairingOutcome, code: PairingCode): PairingStep[] {
  const ceremony: PairingStep[] =
    code.bootstrap === null ? ['reach', 'verify'] : ['reach', 'enroll', 'verify'];
  if (!('fails' in outcome)) return ceremony;
  const failed = failureStep(outcome.fails);
  const last = failed === 'authenticate' ? 'reach' : failed;
  return ceremony.slice(0, ceremony.indexOf(last) + 1);
}
