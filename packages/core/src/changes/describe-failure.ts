import { explanation, presentation, userFacingDescription } from '../errors/presentation';
import type { Translate } from '../errors/text';
import { TransportFailure } from '../errors/transport-error';
import { CancelledError } from '../hosts/cancellation';
import { readFailureMessage } from './presentation';
import type { Say } from './say';
import { ChangesReadError } from './types';

/** The user-facing words for anything a Changes read can throw. */
export function describeFailure(thrown: unknown, say: Say, translate?: Translate): string {
  if (thrown instanceof ChangesReadError) return readFailureMessage(thrown.reason, say);
  if (thrown instanceof TransportFailure) {
    return explanation(presentation(thrown.error), translate);
  }
  return userFacingDescription(thrown, translate);
}

/** A read the caller abandoned: nothing from it is shown. */
export function isCancellation(thrown: unknown): boolean {
  return (
    thrown instanceof CancelledError ||
    (thrown instanceof TransportFailure && thrown.error.kind === 'cancelled')
  );
}

export function isGitTimeout(thrown: unknown): boolean {
  return thrown instanceof TransportFailure && thrown.error.kind === 'gitTimedOut';
}
