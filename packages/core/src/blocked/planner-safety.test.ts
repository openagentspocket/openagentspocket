import '../chat/programs';
import { describe, expect, it } from 'vitest';
import { screenFixtures } from './golden-fixtures.testkit';
import { planImage } from './golden-image.testkit';
import { type DialogAction, type PlanResult, planKeys } from './plan-types';
import {
  dialogOf,
  focus,
  inputText,
  keys,
  page,
  paste,
  plan,
  refusal,
  SELECTION_KEYS,
  unsupported,
} from './planner-helpers.testkit';
import { parseBlockedDialog, planDialogAction } from './programs';
import { hasTypedText } from './step-builder';
import type { BlockedDialog } from './types';

describe('every plan, over every captured dialog', () => {
  const every: { stem: string; dialog: BlockedDialog; results: PlanResult[] }[] = [];
  for (const program of ['claude', 'codex'] as const) {
    for (const fixture of screenFixtures(program)) {
      const parsed = parseBlockedDialog(fixture.screen, program);
      if (parsed.kind !== 'dialog') continue;
      const dialog = parsed.dialog;
      const actions: DialogAction[] = [
        ...dialog.options.flatMap((option) => [
          { kind: 'choose', ordinal: option.ordinal } as const,
          { kind: 'amend', ordinal: option.ordinal, note: 'A note' } as const,
          { kind: 'respond', ordinal: option.ordinal, text: 'An answer' } as const,
        ]),
        { kind: 'approvePlan', note: 'A note' },
        { kind: 'submitSelection', ordinals: dialog.options.map((option) => option.ordinal) },
        { kind: 'dismiss' },
        { kind: 'expandQuestions' },
        { kind: 'skipQuestion' },
      ];
      every.push({
        stem: fixture.name,
        dialog,
        results: actions.map((action) => planDialogAction(dialog, action, 'toolu_x')),
      });
    }
  }

  it('covers both programs', () => {
    expect(every.length).toBeGreaterThan(20);
  });

  it('sends selection keys only as keys, never inside a paste', () => {
    for (const { stem, results } of every) {
      for (const result of results) {
        if (!result.ok) continue;
        for (const step of result.plan.steps) {
          if (step.kind !== 'paste') continue;
          expect(SELECTION_KEYS.has(step.text), `${stem}: ${step.text}`).toBe(false);
          const unsafe = [...step.text].some((character) => {
            const value = character.codePointAt(0) ?? 0;
            return (
              value < 0x20 ||
              (value >= 0x7f && value < 0xa0) ||
              value === 0x2028 ||
              value === 0x2029
            );
          });
          expect(unsafe, stem).toBe(false);
        }
      }
    }
  });

  it('checks the focus after every arrow, so a stray key stops the plan before Enter', () => {
    for (const { stem, results } of every) {
      for (const result of results) {
        if (!result.ok) continue;
        const { steps } = result.plan;
        steps.forEach((step, at) => {
          if (step.kind !== 'keys' || !step.keys.some((key) => ['up', 'down'].includes(key)))
            return;
          expect(steps[at + 1]?.kind, `${stem}: an arrow without a check`).toBe('expect');
        });
      }
    }
  });

  it('plans digits only for numbers 1 to 9 and never a multi-key digit', () => {
    for (const { results } of every) {
      for (const result of results) {
        if (!result.ok) continue;
        for (const key of planKeys(result.plan)) {
          if (/^\d+$/.test(key)) expect(key).toMatch(/^[1-9]$/);
        }
      }
    }
  });

  it('is a pure function of the dialog: planning twice gives the same plan', () => {
    for (const { dialog } of every) {
      const choose = { kind: 'choose', ordinal: 1 } as const;
      expect(planImage(planDialogAction(dialog, choose))).toEqual(
        planImage(planDialogAction(dialog, choose)),
      );
    }
  });

  it('gives each plan exactly one confirmation rule', () => {
    for (const { results } of every) {
      for (const result of results) {
        if (result.ok) expect(result.plan.confirmation.kind).toBeTruthy();
      }
    }
  });
});

describe('Claude permissions', () => {
  it('a digit picks an option; Esc declines; the matched request confirms by its result', () => {
    expect(plan({ kind: 'choose', ordinal: 1 }, 'claude-02-c1-bash-blocked')).toEqual({
      steps: [keys('1')],
      confirmation: { kind: 'fingerprintChange' },
      focusesComposer: false,
    });
    expect(
      plan({ kind: 'choose', ordinal: 4 }, 'claude-02-c1-bash-blocked', 'toolu_01').confirmation,
    ).toEqual({
      kind: 'toolResult',
      id: 'toolu_01',
    });
    expect(plan({ kind: 'dismiss' }, 'claude-02-c1-bash-blocked').steps).toEqual([keys('esc')]);
    expect(refusal({ kind: 'choose', ordinal: 5 }, 'claude-02-c1-bash-blocked')).toEqual({
      kind: 'noSuchOption',
      ordinal: 5,
    });
  });

  it('a note on No: arrows to the row, Tab, paste, check, Enter', () => {
    const note = 'Do not create it; reply with the single word skipped';
    const tail = [paste(note), inputText(note), keys('enter')];
    expect(plan({ kind: 'amend', ordinal: 4, note }, 'claude-02-c1-bash-blocked').steps).toEqual([
      keys('down'),
      focus(2),
      keys('down'),
      focus(3),
      keys('down'),
      focus(4),
      keys('tab'),
      { kind: 'expect', expectation: { kind: 'feedbackMode', ordinal: 4 } },
      ...tail,
    ]);
    // The field already open skips the Tab.
    expect(plan({ kind: 'amend', ordinal: 4, note }, 'claude-04-c1-tab-on-no').steps).toEqual(tail);
  });

  it('notes go only on the Yes and No rows of Bash and file dialogs', () => {
    expect(
      refusal({ kind: 'amend', ordinal: 2, note: 'note' }, 'claude-02-c1-bash-blocked'),
    ).toEqual(unsupported('Only the Yes and No rows take a note.'));
    expect(refusal({ kind: 'amend', ordinal: 3, note: 'note' }, 'claude-24-c8-webfetch')).toEqual(
      unsupported("Only Claude's Bash and file dialogs take a note with the answer."),
    );
    expect(
      refusal({ kind: 'amend', ordinal: 4, note: 'one\ntwo' }, 'claude-02-c1-bash-blocked'),
    ).toEqual({
      kind: 'multilineText',
    });
  });

  it.each([
    'claude-05-c1-pasted-feedback',
    'claude-07-c2-pasted',
    'claude-13-c4-q2-pasted',
    'claude-18-c6-pasted',
    'claude-35-c7-phone-pasted-truncated',
    'claude-37-c7-phone-yes-pasted-wrapped',
  ])('text typed in the terminal stops every plan but Esc (%s)', (stem) => {
    const dialog = dialogOf(stem);
    expect(hasTypedText(dialog)).toBe(true);
    for (const option of dialog.options) {
      const result = planDialogAction(dialog, { kind: 'choose', ordinal: option.ordinal });
      expect(result).toEqual({ ok: false, error: { kind: 'textFieldNotEmpty' } });
    }
    const field = dialog.options.find((option) => option.input !== null);
    if (!field) throw new Error('no field');
    const typing: DialogAction =
      dialog.kind === 'claudeBash'
        ? { kind: 'amend', ordinal: field.ordinal, note: 'more' }
        : { kind: 'respond', ordinal: field.ordinal, text: 'more' };
    expect(planDialogAction(dialog, typing)).toEqual({
      ok: false,
      error: { kind: 'textFieldNotEmpty' },
    });
    const dismissed = planDialogAction(dialog, { kind: 'dismiss' });
    expect(dismissed.ok && dismissed.plan.steps).toEqual([keys('esc')]);
  });

  it('digits step off a focused empty field first', () => {
    expect(plan({ kind: 'choose', ordinal: 1 }, 'claude-04-c1-tab-on-no').steps).toEqual([
      keys('up'),
      focus(3),
      keys('1'),
    ]);
    expect(plan({ kind: 'choose', ordinal: 4 }, 'claude-06-c2-tab-on-yes').steps).toEqual([
      keys('down'),
      focus(2),
      keys('4'),
    ]);
  });

  it('plan: approve by digit, send back or approve with a note', () => {
    const stem = 'claude-16-c6-exitplan-1';
    const note = 'Name the file q.txt instead';
    expect(plan({ kind: 'choose', ordinal: 2 }, stem).steps).toEqual([keys('2')]);
    expect(refusal({ kind: 'choose', ordinal: 3 }, stem)).toEqual({ kind: 'needsText' });
    expect(plan({ kind: 'respond', ordinal: 3, text: note }, stem).steps).toEqual([
      keys('3'),
      focus(3),
      paste(note),
      inputText(note),
      keys('enter'),
    ]);
    expect(plan({ kind: 'approvePlan', note }, stem).steps.at(-1)).toEqual(keys('shift+tab'));
    expect(refusal({ kind: 'respond', ordinal: 1, text: note }, stem)).toEqual(
      unsupported('Option %lld is not a text field.'),
    );
    expect(refusal({ kind: 'approvePlan', note }, 'claude-02-c1-bash-blocked')).toEqual(
      unsupported('This dialog does not offer approving with feedback.'),
    );
  });

  it('multi-select: a checked digit each, arrows to Next, Enter, the next page', () => {
    const steps = plan({ kind: 'submitSelection', ordinals: [1, 3] }, 'claude-08-c4-auq-q1').steps;
    expect(steps.slice(0, 4)).toEqual([
      keys('1'),
      { kind: 'expect', expectation: { kind: 'checked', ordinals: [1] } },
      keys('3'),
      { kind: 'expect', expectation: { kind: 'checked', ordinals: [1, 3] } },
    ]);
    expect(steps.slice(-2)).toEqual([keys('enter'), page('Size')]);
    expect(plan({ kind: 'choose', ordinal: 6 }, 'claude-08-c4-auq-q1').steps).toEqual([keys('5')]);
  });

  it('multi-select refusals', () => {
    const stem = 'claude-08-c4-auq-q1';
    expect(refusal({ kind: 'choose', ordinal: 1 }, stem)).toEqual(
      unsupported('A multi-select question takes its answers as a set.'),
    );
    expect(refusal({ kind: 'submitSelection', ordinals: [] }, stem)).toEqual({
      kind: 'emptySelection',
    });
    expect(refusal({ kind: 'submitSelection', ordinals: [9] }, stem)).toEqual({
      kind: 'noSuchOption',
      ordinal: 9,
    });
    expect(refusal({ kind: 'respond', ordinal: 4, text: 'Teal' }, stem)).toEqual(
      unsupported("Agentico does not type into a multi-select question's Other row."),
    );
    expect(refusal({ kind: 'submitSelection', ordinals: [1] }, 'claude-11-c4-q2')).toEqual(
      unsupported('Only a multi-select question takes a set of answers.'),
    );
  });

  it('single select: a digit answers and turns the page; Other takes text', () => {
    const stem = 'claude-11-c4-q2';
    expect(plan({ kind: 'choose', ordinal: 2 }, stem).steps).toEqual([
      keys('2'),
      page('Review your answers'),
    ]);
    expect(refusal({ kind: 'choose', ordinal: 3 }, stem)).toEqual({ kind: 'needsText' });
  });

  it('trust: arrows and Enter, since the options have no numbers', () => {
    expect(plan({ kind: 'choose', ordinal: 2 }, 'claude-00-trust').steps).toEqual([
      keys('down'),
      focus(2),
      keys('enter'),
    ]);
    expect(plan({ kind: 'choose', ordinal: 1 }, 'claude-00-trust').steps).toEqual([keys('enter')]);
    expect(refusal({ kind: 'skipQuestion' }, 'claude-00-trust')).toEqual(
      unsupported('Only Codex queues questions.'),
    );
  });
});
