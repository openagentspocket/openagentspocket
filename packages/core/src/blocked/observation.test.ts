import { describe, expect, it } from 'vitest';
import type { DialogFingerprint } from './fingerprint';
import { loadScreen } from './golden-fixtures.testkit';
import {
  confirmationMet,
  expectationMet,
  type ObservedActivity,
  observeDialog,
} from './observation';
import type { ConfirmationRule, DialogExpectation } from './plan-types';
import { resultFingerprint } from './types';

const programOf = (stem: string) => (stem.startsWith('codex') ? 'codex' : 'claude');

function look(stem: string, activity: ObservedActivity = 'unknown', resolved: string[] = []) {
  return observeDialog(loadScreen(stem), programOf(stem), activity, new Set(resolved));
}

function fingerprintOf(stem: string): DialogFingerprint {
  const fingerprint = resultFingerprint(look(stem).result);
  if (!fingerprint) throw new Error(`${stem} shows no dialog`);
  return fingerprint;
}

const meets = (expectation: DialogExpectation, stem: string, fingerprint: DialogFingerprint) =>
  expectationMet(expectation, look(stem), fingerprint);

const confirms = (
  rule: ConfirmationRule,
  stem: string,
  fingerprint: DialogFingerprint,
  activity: ObservedActivity = 'unknown',
  resolved: string[] = [],
) => confirmationMet(rule, look(stem, activity, resolved), fingerprint);

describe('expectations', () => {
  it('fail once the dialog changed', () => {
    const first = fingerprintOf('claude-30-par-first');
    expect(meets({ kind: 'focus', ordinal: 1 }, 'claude-30-par-first', first)).toBe(true);
    // The next request also has focus on 1, but asks about another command.
    expect(meets({ kind: 'focus', ordinal: 1 }, 'claude-31-par-second', first)).toBe(false);
  });

  it('check boxes, pages, notes and the queued notice', () => {
    const colors = fingerprintOf('claude-08-c4-auq-q1');
    expect(meets({ kind: 'checked', ordinals: [1, 3] }, 'claude-09-c4-toggled', colors)).toBe(true);
    expect(meets({ kind: 'checked', ordinals: [1] }, 'claude-09-c4-toggled', colors)).toBe(false);
    expect(meets({ kind: 'focus', ordinal: 5 }, 'claude-10-c4-focus-next', colors)).toBe(true);
    expect(meets({ kind: 'page', page: 'Size' }, 'claude-11-c4-q2', colors)).toBe(true);
    expect(meets({ kind: 'page', page: 'Size' }, 'claude-10-c4-focus-next', colors)).toBe(false);
    expect(
      meets({ kind: 'page', page: 'Review your answers' }, 'claude-14-c4-review', colors),
    ).toBe(true);

    const size = fingerprintOf('codex-05-x3-q2');
    expect(
      meets(
        { kind: 'page', page: 'Question 2/2' },
        'codex-05-x3-q2',
        fingerprintOf('codex-04-x3-q1'),
      ),
    ).toBe(true);
    expect(meets({ kind: 'notes', text: 'Medium please' }, 'codex-07-x3-q2-pasted', size)).toBe(
      true,
    );
    expect(meets({ kind: 'notes', text: 'Medium please' }, 'codex-06-x3-q2-up', size)).toBe(false);
    const fruit = fingerprintOf('codex-09-x4-expanded');
    expect(
      meets({ kind: 'queuedNotice', title: 'Pick a fruit' }, 'codex-10-x4-after-digit', fruit),
    ).toBe(true);
    expect(
      meets({ kind: 'queuedNotice', title: 'Pick a fruit' }, 'codex-09-x4-expanded', fruit),
    ).toBe(false);
  });

  it('see a note turn the No row into a field', () => {
    const bash = fingerprintOf('claude-02-c1-bash-blocked');
    expect(meets({ kind: 'feedbackMode', ordinal: 4 }, 'claude-04-c1-tab-on-no', bash)).toBe(true);
    expect(meets({ kind: 'feedbackMode', ordinal: 4 }, 'claude-03-c1-focus-no', bash)).toBe(false);
    const note = 'Do not create it; reply with the single word skipped';
    expect(meets({ kind: 'inputText', text: note }, 'claude-05-c1-pasted-feedback', bash)).toBe(
      true,
    );
    expect(
      meets({ kind: 'inputText', text: 'something else' }, 'claude-05-c1-pasted-feedback', bash),
    ).toBe(false);
  });

  it('accept a note cut off at the phone width with an ellipsis', () => {
    const bash = fingerprintOf('claude-32-c7-phone-bash-blocked');
    const note = 'Do not create it; reply with the single word skipped';
    expect(
      meets({ kind: 'inputText', text: note }, 'claude-35-c7-phone-pasted-truncated', bash),
    ).toBe(true);
  });
});

describe('confirmation rules', () => {
  it('confirm a Claude dialog by the tool result or by the dialog leaving', () => {
    const bash = fingerprintOf('claude-02-c1-bash-blocked');
    const rule: ConfirmationRule = { kind: 'toolResult', id: 'toolu_01' };
    expect(confirms(rule, 'claude-03-c1-focus-no', bash)).toBe(false);
    expect(confirms(rule, 'claude-03-c1-focus-no', bash, 'unknown', ['toolu_01'])).toBe(true);
    expect(confirms(rule, 'claude-29-c3-after-immediate', bash, 'working')).toBe(true);
    // Leaving Blocked alone does not confirm a Claude dialog.
    expect(confirms({ kind: 'fingerprintChange' }, 'claude-03-c1-focus-no', bash, 'idle')).toBe(
      false,
    );
    expect(
      confirms(
        { kind: 'fingerprintChange' },
        'claude-31-par-second',
        fingerprintOf('claude-30-par-first'),
      ),
    ).toBe(true);
  });

  it('confirm a Codex dialog by it leaving, the Agent leaving Blocked, or the queued notice', () => {
    const first = fingerprintOf('codex-13-par-first');
    const rule: ConfirmationRule = { kind: 'fingerprintChangeOrUnblocked' };
    expect(confirms(rule, 'codex-13-par-first', first)).toBe(false);
    expect(confirms(rule, 'codex-13-par-first', first, 'unknown')).toBe(false);
    expect(confirms(rule, 'codex-13-par-first', first, 'working')).toBe(true);
    expect(confirms(rule, 'codex-13-par-first', first, 'idle')).toBe(true);
    expect(confirms(rule, 'codex-14-par-second', first)).toBe(true);

    const fruit = fingerprintOf('codex-09-x4-expanded');
    const notice: ConfirmationRule = { kind: 'queuedNotice', title: 'Pick a fruit' };
    expect(confirms(notice, 'codex-10-x4-after-digit', fruit)).toBe(true);
    expect(confirms(notice, 'codex-09-x4-expanded', fruit)).toBe(false);
  });
});
