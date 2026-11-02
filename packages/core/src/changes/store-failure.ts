import type { Translate } from '../errors/text';
import { describeFailure, isGitTimeout } from './describe-failure';
import type { Say } from './say';
import type { ChangesState } from './store-types';
import { ChangesReadError } from './types';

/** What a failed read changes in the store, and whether it makes an open diff meaningless. */
export function failureUpdate(
  thrown: unknown,
  hasDocument: boolean,
  say: Say,
  translate?: Translate,
): { update: Partial<ChangesState>; closeDiff: boolean } {
  if (thrown instanceof ChangesReadError) {
    const { kind } = thrown.reason;
    return {
      closeDiff: kind === 'notAGitWorkingTree' || kind === 'directoryMissing',
      update: {
        phase: { kind: 'readFailed', reason: thrown.reason },
        directoryPrefix: '',
        timedOutKeepingContent: false,
      },
    };
  }
  // A timed-out refresh keeps the last document, identity and scroll position.
  if (isGitTimeout(thrown) && hasDocument) {
    return { closeDiff: false, update: { timedOutKeepingContent: true } };
  }
  return {
    closeDiff: false,
    update: {
      phase: isGitTimeout(thrown)
        ? { kind: 'timedOut' }
        : { kind: 'failed', message: describeFailure(thrown, say, translate) },
      directoryPrefix: '',
      timedOutKeepingContent: false,
    },
  };
}
