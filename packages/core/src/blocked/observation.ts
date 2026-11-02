import type { ChatProgram } from '../chat/model/types';
import { codexQueuedNoticeShows } from './codex-extras';
import { comparable } from './comparable';
import { type DialogFingerprint, fingerprintsMatch } from './fingerprint';
import type { ConfirmationRule, DialogExpectation } from './plan-types';
import { parseBlockedDialog } from './programs';
import type { AnsiScreen } from './screen';
import { type DialogParseResult, resultDialog, resultFingerprint } from './types';

/** The Agent's activity as the Blocked card's confirmation rules see it. */
export type ObservedActivity = 'unknown' | 'idle' | 'working' | 'blocked';

/** A fresh read of the Agent while a card acts, which expectations and rules are checked against. */
export interface DialogObservation {
  readonly screen: AnsiScreen;
  readonly result: DialogParseResult;
  readonly activity: ObservedActivity;
  /** Tool uses whose results the transcript shows. */
  readonly resolvedToolUseIDs: ReadonlySet<string>;
}

export function observeDialog(
  screen: AnsiScreen,
  program: ChatProgram,
  activity: ObservedActivity = 'unknown',
  resolvedToolUseIDs: ReadonlySet<string> = new Set(),
): DialogObservation {
  return { screen, result: parseBlockedDialog(screen, program), activity, resolvedToolUseIDs };
}

/**
 * Whether `observation` shows what a step expects. Expectations about the same dialog fail once
 * its fingerprint no longer matches, so later keys never land on a dialog the user did not see.
 */
export function expectationMet(
  expectation: DialogExpectation,
  observation: DialogObservation,
  fingerprint: DialogFingerprint,
): boolean {
  const dialog = resultDialog(observation.result);
  if (expectation.kind === 'page') {
    return dialog?.progress != null && comparable(dialog.progress) === comparable(expectation.page);
  }
  if (expectation.kind === 'queuedNotice') {
    return codexQueuedNoticeShows(expectation.title, observation.screen);
  }
  if (!dialog || !fingerprintsMatch(dialog.fingerprint, fingerprint)) return false;
  const { focus } = dialog;
  switch (expectation.kind) {
    case 'focus':
      return focus.focusedOrdinal === expectation.ordinal;
    case 'feedbackMode':
      return (
        focus.focusedOrdinal === expectation.ordinal &&
        focus.feedbackOrdinal === expectation.ordinal &&
        focus.inputText === null
      );
    case 'inputText': {
      const shown = focus.inputText;
      if (shown === null) return false;
      // Wrapping moves spaces around, so compare without them. A note too long for its row shows
      // only its start, cut off with `…`.
      const expected = comparable(expectation.text);
      if (shown.endsWith('…') && !expected.endsWith('…')) {
        const start = comparable(shown.slice(0, -1));
        return start !== '' && expected.startsWith(start);
      }
      return comparable(shown) === expected;
    }
    case 'notes':
      return (
        focus.notesText !== null && comparable(focus.notesText) === comparable(expectation.text)
      );
    case 'checked': {
      const wanted = [...expectation.ordinals].sort((a, b) => a - b);
      return (
        focus.checked.length === wanted.length &&
        focus.checked.every((ordinal, at) => ordinal === wanted[at])
      );
    }
  }
}

/** Whether `observation` confirms the keys sent for the dialog with `fingerprint`. */
export function confirmationMet(
  rule: ConfirmationRule,
  observation: DialogObservation,
  fingerprint: DialogFingerprint,
): boolean {
  const shown = resultFingerprint(observation.result);
  const dialogLeft = !(shown !== null && fingerprintsMatch(shown, fingerprint));
  switch (rule.kind) {
    case 'toolResult':
      return observation.resolvedToolUseIDs.has(rule.id) || dialogLeft;
    case 'fingerprintChange':
      return dialogLeft;
    case 'fingerprintChangeOrUnblocked':
      return dialogLeft || observation.activity === 'idle' || observation.activity === 'working';
    case 'queuedNotice':
      return codexQueuedNoticeShows(rule.title, observation.screen) || dialogLeft;
  }
}
