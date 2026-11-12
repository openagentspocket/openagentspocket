import '../chat/programs';
import { describe, expect, it } from 'vitest';
import { renderText } from '../errors/text';
import { loadScreen } from './golden-fixtures.testkit';
import type { DialogAction } from './plan-types';
import {
  dialogOf,
  focus,
  keys,
  page,
  paste,
  plan,
  refusal,
  unsupported,
} from './planner-helpers.testkit';
import { parseBlockedDialog, planDialogAction, planGenericOption } from './programs';
import { digitKey, fieldText, StepBuilder } from './step-builder';

describe('Codex', () => {
  it('an approval digit acts at once; a decline hands over to the composer', () => {
    const stem = 'codex-01-x1-exec';
    expect(plan({ kind: 'choose', ordinal: 1 }, stem)).toEqual({
      steps: [keys('1')],
      confirmation: { kind: 'fingerprintChangeOrUnblocked' },
      focusesComposer: false,
    });
    expect(plan({ kind: 'choose', ordinal: 3 }, stem).focusesComposer).toBe(true);
    expect(plan({ kind: 'dismiss' }, stem).focusesComposer).toBe(true);
    expect(refusal({ kind: 'amend', ordinal: 3, note: 'note' }, stem)).toEqual(
      unsupported('Codex ignores text on approvals; decline, then tell Codex in the composer.'),
    );
  });

  it('a question digit answers and moves on; notes go on None of the above', () => {
    const note = 'Medium please';
    expect(plan({ kind: 'choose', ordinal: 2 }, 'codex-04-x3-q1').steps).toEqual([
      keys('2'),
      page('Question 2/2'),
    ]);
    expect(plan({ kind: 'respond', ordinal: 3, text: note }, 'codex-06-x3-q2-up').steps).toEqual([
      keys('tab'),
      { kind: 'expect', expectation: { kind: 'notes', text: '' } },
      paste(note),
      { kind: 'expect', expectation: { kind: 'notes', text: note } },
      keys('enter'),
    ]);
    expect(refusal({ kind: 'respond', ordinal: 1, text: note }, 'codex-05-x3-q2')).toEqual(
      unsupported('Agentico adds notes only to None of the above.'),
    );
  });

  it('typed notes stop every plan', () => {
    for (const action of [
      { kind: 'choose', ordinal: 1 },
      { kind: 'respond', ordinal: 3, text: 'Large' },
      { kind: 'dismiss' },
    ] as const) {
      expect(refusal(action, 'codex-07-x3-q2-pasted')).toEqual({ kind: 'textFieldNotEmpty' });
    }
  });

  it('asynchronous questions: open them, answer into the queue, or skip', () => {
    expect(plan({ kind: 'expandQuestions' }, 'codex-08-x4-async-collapsed')).toEqual({
      steps: [keys('shift+left')],
      confirmation: { kind: 'fingerprintChange' },
      focusesComposer: false,
    });
    expect(plan({ kind: 'choose', ordinal: 1 }, 'codex-09-x4-expanded').confirmation).toEqual({
      kind: 'queuedNotice',
      title: 'Pick a fruit',
    });
    expect(plan({ kind: 'skipQuestion' }, 'codex-09-x4-expanded').steps).toEqual([keys('ctrl+]')]);
    expect(refusal({ kind: 'dismiss' }, 'codex-09-x4-expanded')).toEqual(
      unsupported('Codex offers only an answer or a skip here.'),
    );
  });

  it('plans the same with the matched call id as without it', () => {
    const cases: [DialogAction, string][] = [
      [{ kind: 'choose', ordinal: 1 }, 'codex-01-x1-exec'],
      [{ kind: 'choose', ordinal: 3 }, 'codex-01-x1-exec'],
      [{ kind: 'dismiss' }, 'codex-01-x1-exec'],
      [{ kind: 'respond', ordinal: 3, text: 'Teal' }, 'codex-04-x3-q1'],
    ];
    for (const [action, stem] of cases) {
      expect(plan(action, stem, 'call_1')).toEqual(plan(action, stem));
    }
  });
});

describe('the generic card, field text and moves', () => {
  it('presses the digits an excerpt lists and refuses a cursor in a field', () => {
    const screen = loadScreen('codex-15-x6-mcp-tool-list');
    const parsed = parseBlockedDialog(screen, 'codex');
    if (parsed.kind !== 'unrecognized') throw new Error('expected an excerpt');
    expect(planGenericOption(2, parsed.excerpt, 'codex')).toEqual({
      ok: true,
      plan: {
        steps: [keys('2')],
        confirmation: { kind: 'fingerprintChangeOrUnblocked' },
        focusesComposer: false,
      },
    });
    expect(planGenericOption(7, parsed.excerpt, 'codex')).toEqual({
      ok: false,
      error: { kind: 'noSuchOption', ordinal: 7 },
    });
    const cursor = {
      ...parsed.excerpt,
      rows: parsed.excerpt.rows.map((row) => ({
        ...row,
        runs: row.runs.map((run) => ({ ...run, style: { ...run.style, isReverse: true } })),
      })),
    };
    const claude = planGenericOption(2, cursor, 'claude');
    expect(claude.ok).toBe(false);
    expect(planGenericOption(2, cursor, 'codex').ok).toBe(true);
  });

  it('hands every other program to the terminal until its planner is registered', () => {
    const parsed = parseBlockedDialog(loadScreen('codex-15-x6-mcp-tool-list'), 'codex');
    if (parsed.kind !== 'unrecognized') throw new Error('expected an excerpt');
    const result = planGenericOption(1, parsed.excerpt, 'opencode');
    expect(result.ok === false && result.error.kind === 'unsupported').toBe(true);
    expect(parseBlockedDialog(loadScreen('codex-15-x6-mcp-tool-list'), 'pi')).toEqual({
      kind: 'none',
    });
  });

  it('field text is one trimmed line without control characters', () => {
    const refusalOf = (text: string): string | null => {
      const probe = dialogOf('claude-16-c6-exitplan-1');
      const result = planDialogAction(probe, { kind: 'respond', ordinal: 3, text });
      return result.ok ? null : result.error.kind;
    };
    expect(fieldText('  Use q.txt  ')).toBe('Use q.txt');
    expect(refusalOf('   ')).toBe('emptyText');
    expect(refusalOf('one\ntwo')).toBe('multilineText');
    expect(refusalOf('one\r\ntwo')).toBe('multilineText');
    expect(refusalOf('one two')).toBe('multilineText');
    expect(refusalOf('one\ttwo')).toBe('unsafeText');
    expect(refusalOf('one\u001b[Atwo')).toBe('unsafeText');
  });

  it('binds digits 1 to 9 only', () => {
    expect(digitKey(9)).toBe('9');
    expect(digitKey(10)).toBeNull();
    expect(digitKey(0)).toBeNull();
    expect(digitKey(null)).toBeNull();
  });

  it('moves send one checked arrow per row and need a focused row', () => {
    const dialog = dialogOf('claude-02-c1-bash-blocked');
    const builder = new StepBuilder(dialog);
    builder.move(3);
    expect(builder.steps).toEqual([keys('down'), focus(2), keys('down'), focus(3)]);
    builder.move(3);
    expect(builder.steps).toHaveLength(4);
    const unfocused = new StepBuilder({
      ...dialog,
      focus: { ...dialog.focus, focusedOrdinal: null },
    });
    expect(() => unfocused.move(2)).toThrowError();
  });

  it('renders refusals through the catalog keys', () => {
    const error = refusal({ kind: 'skipQuestion' }, 'claude-00-trust');
    expect(error.kind === 'unsupported' && renderText(error.reason)).toBe(
      'Only Codex queues questions.',
    );
  });
});
