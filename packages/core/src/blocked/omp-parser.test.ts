// Oh My Pi's panels as captured live: the tool approval is a known dialog, other titled panels hold
// sending as excerpts, and tool renderings are not dialogs (Swift OMPDialogParserTests, the cases
// the goldens do not already pin).

import { describe, expect, it } from 'vitest';
import { renderText } from '../errors/text';
import { decodeAnsiScreen } from './ansi-decoder';
import { loadScreen } from './golden-fixtures.testkit';
import { RULE_LINE } from './omp-display';
import { parseBlockedDialog } from './programs';
import type { AnsiScreen } from './screen';
import type { BlockedDialog, DialogParseResult } from './types';

const parse = (screen: AnsiScreen, program: 'omp' | 'pi' = 'omp'): DialogParseResult =>
  parseBlockedDialog(screen, program);

const dialogOf = (result: DialogParseResult): BlockedDialog | null =>
  result.kind === 'dialog' ? result.dialog : null;

const synthetic = (rows: string[]): AnsiScreen => decodeAnsiScreen(rows.join('\r\n'));
const dash = (count: number) => '─'.repeat(count);

const BAND = '\u001b[48;2;15;18;22m ⠹ 1m  project \u001b[0m──3%────272K─';

/** A panel resting on the working band, the prompt below it. */
function panel(options: { border: string; details: string[]; footer?: string }): AnsiScreen {
  const rows = ['Working…', options.border, ...options.details.map((row) => `│ ${row} │`)];
  if (options.footer !== undefined) rows.push(`├${dash(30)}┤`, `│ ${options.footer} │`);
  rows.push(`╰${dash(30)}╯`, BAND, '╰─ ');
  return synthetic(rows);
}

const approvalPanel = (title: string, details: string[], footer?: string) =>
  panel({
    border: `╭─ ${title} ${dash(20)}╮`,
    details,
    footer: footer ?? 'ctrl+q approve · esc deny · type to steer instead',
  });

const SELECT_FOOTER = '\u{F0311} select · ↑/↓ move · \u{F12B7} cancel';
const MULTI_FOOTER = '\u{F1050} toggle · \u{F0311} submit · ↑/↓ move · \u{F12B7} cancel';

/** An `Ask` panel with these question and option rows, ending the screen. */
function ask(question: string[], options: string[], footer = SELECT_FOOTER): AnsiScreen {
  const rule = `├${dash(30)}┤`;
  return synthetic([
    'Asking…',
    `╭─ Ask ${dash(24)}╮`,
    ...question.map((row) => `│ ${row} │`),
    rule,
    ...options.map((row) => `│ ${row} │`),
    rule,
    `│ ${footer} │`,
    `╰${dash(30)}╯`,
  ]);
}

describe('approval panels', () => {
  it.each([
    ['omp-24-approval-a-dialog', 'echo approved-2', 33],
    ['omp-23-approval-a-ctrlq-early', 'echo approved-1', 24],
  ])('parses %s with its command and two options', (stem, command, top) => {
    const dialog = dialogOf(parse(loadScreen(stem))) as BlockedDialog;
    expect([dialog.kind, dialog.program, dialog.title]).toEqual([
      'ompApproval',
      'omp',
      'Allow tool: bash',
    ]);
    expect([dialog.subject.toolName, dialog.subject.command, dialog.subject.reason]).toEqual([
      'bash',
      command,
      null,
    ]);
    expect(dialog.body).toEqual([`Command: ${command}`]);
    expect(dialog.rows).toEqual({ lowerBound: top, upperBound: top + 5 });
    expect(dialog.options.map((o) => [o.label, o.shortcut, o.role, o.number])).toEqual([
      ['Approve', 'ctrl+q', 'approve', null],
      ['Deny', 'esc', 'decline', null],
    ]);
  });

  it('makes 18.12 choice list the options, session row included', () => {
    const dialog = dialogOf(parse(loadScreen('omp-36-approval-edit-18-12'))) as BlockedDialog;
    expect(dialog.title).toBe('Allow tool: edit');
    expect(dialog.body).toEqual(['File: notes.txt']);
    expect(dialog.rows).toEqual({ lowerBound: 30, upperBound: 38 });
    expect(dialog.options.map((o) => [o.label, o.shortcut, o.role, o.ordinal])).toEqual([
      ['Approve', 'ctrl+q', 'approve', 1],
      ['Approve edit for this session', null, 'approvePersistent', 2],
      ['Deny', 'esc', 'decline', 3],
    ]);
    expect(dialog.focus.focusedOrdinal).toBe(1);
    expect(dialog.focus.composerDraftGuard).toBe(false);
  });

  it('follows the pointer without changing the fingerprint', () => {
    const base = dialogOf(parse(loadScreen('omp-36-approval-edit-18-12'))) as BlockedDialog;
    const moved = dialogOf(
      parse(loadScreen('omp-37-approval-session-a-after-down')),
    ) as BlockedDialog;
    expect(moved.focus.focusedOrdinal).toBe(2);
    expect(moved.fingerprint).toEqual(base.fingerprint);
    // With a draft in the prompt below, no focus is read.
    const drafted = dialogOf(parse(loadScreen('omp-37-approval-session-b-draft'))) as BlockedDialog;
    expect(drafted.focus.focusedOrdinal).toBeNull();
    expect(drafted.focus.composerDraftGuard).toBe(true);
    expect(drafted.fingerprint).toEqual(moved.fingerprint);
  });

  it('ignores the draft footer and the countdown in the fingerprint', () => {
    const clean = dialogOf(parse(loadScreen('omp-24-approval-a-dialog'))) as BlockedDialog;
    const drafted = dialogOf(parse(loadScreen('omp-24-approval-d-typed-abc'))) as BlockedDialog;
    expect(drafted.fingerprint).toEqual(clean.fingerprint);
    const early = dialogOf(parse(loadScreen('omp-23-approval-a-ctrlq-early'))) as BlockedDialog;
    expect(early.fingerprint).not.toEqual(clean.fingerprint);
    const counting = dialogOf(
      parse(approvalPanel('Allow tool: bash (30s)', ['Command: echo approved-2'])),
    ) as BlockedDialog;
    expect(counting.title).toBe('Allow tool: bash');
    expect(counting.fingerprint).toEqual(clean.fingerprint);
  });

  it('reads a cut-off command and a reason', () => {
    const dialog = dialogOf(
      parse(
        approvalPanel('Allow tool: bash', [
          'Command: rm -rf build && make…',
          'Reason: Cleans the build',
        ]),
      ),
    ) as BlockedDialog;
    expect([dialog.subject.command, dialog.subject.reason]).toEqual([
      'rm -rf build && make',
      'Cleans the build',
    ]);
  });

  it('leaves an approval without its keys unrecognized', () => {
    const result = parse(approvalPanel('Allow tool: bash', ['Command: ls'], '↑/↓ scroll'));
    expect(result.kind).toBe('unrecognized');
  });

  it('leaves the plan review unrecognized', () => {
    const result = parse(loadScreen('omp-31-plan-review'));
    if (result.kind !== 'unrecognized') throw new Error('expected an excerpt');
    expect(renderText(result.excerpt.reason)).toBe(
      "Agentico does not know Oh My Pi's “Plan Review” panel.",
    );
    expect(result.excerpt.numbered.size).toBe(0);
    expect(result.excerpt.rows[0]?.text.trim().startsWith('╭─ Plan Review ─')).toBe(true);
  });
});

describe('ask panels', () => {
  it('starts on the first option of a single question', () => {
    const dialog = dialogOf(parse(loadScreen('omp-27-ask-a-dialog'))) as BlockedDialog;
    expect([dialog.kind, dialog.title, dialog.progress, dialog.body]).toEqual([
      'ompQuestion',
      'Pick a fruit',
      null,
      ['Pick a fruit'],
    ]);
    expect(dialog.subject.questionHeaders).toEqual([]);
    expect(dialog.rows).toEqual({ lowerBound: 28, upperBound: 40 });
    expect(dialog.options.map((o) => [o.label, o.role])).toEqual([
      ['apple', 'answer'],
      ['pear', 'answer'],
      ['plum', 'answer'],
      ['Other (type your own)', 'otherText'],
    ]);
    expect(dialog.focus.focusedOrdinal).toBe(1);
  });

  it('moves focus with down and ignores digits', () => {
    const first = dialogOf(parse(loadScreen('omp-27-ask-a-dialog'))) as BlockedDialog;
    const moved = dialogOf(parse(loadScreen('omp-27-ask-c-after-down'))) as BlockedDialog;
    expect(moved.focus.focusedOrdinal).toBe(2);
    expect(moved.fingerprint).toEqual(first.fingerprint);
    // OMP binds no digits to its options: `2` leaves the panel as it was.
    const afterDigit = dialogOf(parse(loadScreen('omp-27-ask-b-after-digit2'))) as BlockedDialog;
    expect(afterDigit.fingerprint).toEqual(first.fingerprint);
    expect(afterDigit.focus).toEqual(first.focus);
  });

  it('reads tabs, the second page and the review page', () => {
    const fruit = dialogOf(parse(loadScreen('omp-28-ask2-a-dialog'))) as BlockedDialog;
    expect(fruit.subject.questionHeaders).toEqual(['fruit', 'size']);
    expect([fruit.progress, fruit.subject.question]).toEqual(['fruit', 'Pick a fruit']);
    const size = dialogOf(parse(loadScreen('omp-28-ask2-b-after-enter-q1'))) as BlockedDialog;
    expect([size.progress, size.subject.question]).toEqual(['size', 'Pick a size']);
    expect(size.fingerprint).not.toEqual(fruit.fingerprint);
    const review = dialogOf(parse(loadScreen('omp-28-ask2-c-submit-page'))) as BlockedDialog;
    expect([review.kind, review.title, review.progress]).toEqual([
      'ompQuestionReview',
      'Review answers',
      'Review answers',
    ]);
    expect(review.subject.reviewAnswers).toEqual([
      { question: 'fruit', answer: 'apple' },
      { question: 'size', answer: 'small' },
    ]);
    expect(review.options.map((o) => [o.label, o.role])).toEqual([['Submit', 'submit']]);
  });

  it('sets the draft guard without changing the fingerprint', () => {
    const guarded = dialogOf(parse(loadScreen('omp-29-guard-b-ask-with-draft'))) as BlockedDialog;
    const free = dialogOf(parse(loadScreen('omp-29-guard-c-after-enter'))) as BlockedDialog;
    expect([
      guarded.title,
      guarded.focus.composerDraftGuard,
      free.focus.composerDraftGuard,
    ]).toEqual(['Pick a color', true, false]);
    expect(guarded.fingerprint).toEqual(free.fingerprint);
    expect(guarded.focus.focusedOrdinal).toBe(free.focus.focusedOrdinal);
  });

  it('drops the Recommended mark', () => {
    const dialog = dialogOf(
      parse(ask(['Pick a fruit'], ['\u{F054} \u{F10C} apple (Recommended)', '  \u{F10C} pear'])),
    );
    expect(dialog?.options.map((o) => o.label)).toEqual(['apple', 'pear']);
  });

  it.each([
    [['\u{F054} \u{F096} apple', '  \u{F096} pear']],
    [['\u{F054} \u{F10C} apple', '    A round fruit', '  \u{F10C} pear']],
    [['\u{F054}\u{F10C} apple']],
  ])('leaves option rows Agentico does not know to the terminal: %j', (options) => {
    const footer = options.some((row) => row.includes('\u{F096}')) ? MULTI_FOOTER : SELECT_FOOTER;
    const result = parse(ask(['Pick a fruit'], options, footer));
    if (result.kind !== 'unrecognized') throw new Error('expected an excerpt');
    expect(result.excerpt.numbered.size).toBe(0);
    expect(renderText(result.excerpt.reason)).toContain('single-select');
  });

  it('shows a captured multi-select question without borders or nerd glyphs', () => {
    const result = parse(loadScreen('omp-34-ask-multi-62'));
    if (result.kind !== 'unrecognized') throw new Error('expected an excerpt');
    const lines = result.excerpt.displayLines ?? [];
    expect(lines).toEqual([
      'Ask',
      ' colors    Submit',
      '请选择颜色（可多选）',
      RULE_LINE,
      '❯ ☐ red',
      '  ☐ green',
      '  ☐ blue',
      '  ☐ Other (type your own)',
      RULE_LINE,
      'toggle · submit · ↑/↓ move · /←/→ question · cance…',
    ]);
    expect(result.excerpt.fingerprint.value).toBe(
      '038f64a1e20da36752fdc2c5f4fa044f4553a1f6a2a30989a11ec37bcc059fcc',
    );
  });

  it('shows a checked box and radios as Unicode symbols', () => {
    const result = parse(
      ask(
        ['Pick fruits'],
        ['\u{F054} \u{F14A} apple', '  \u{F096} pear', '  \u{F192} plum', '  \u{F10C} fig'],
        MULTI_FOOTER,
      ),
    );
    if (result.kind !== 'unrecognized') throw new Error('expected an excerpt');
    const lines = result.excerpt.displayLines ?? [];
    expect(lines).toEqual(expect.arrayContaining(['❯ ☑ apple', '  ☐ pear', '  ◉ plum', '  ○ fig']));
    expect(lines.at(-1)).toBe('toggle · submit · ↑/↓ move · cancel');
  });
});

describe('other screens', () => {
  it.each([
    'omp-26-approval-b-idle',
    'omp-27-ask-e-idle',
    'omp-24-approval-e-enter-deny-and-send',
    'omp-09-tool-working-3s',
    'omp-08-empty-120-after-first',
    'omp-14-slash-popup',
    'omp-33-after-exit-2',
  ])('does not read the tool renderings of %s as a dialog', (stem) => {
    expect(parse(loadScreen(stem)).kind).toBe('none');
  });

  it.each([`╭${dash(30)}╮`, '╭─── Ask 1 questions ─────────╮', '╭───  Ask ────╮'])(
    'does not read an untitled or ruled panel on the band as a dialog: %s',
    (border) => {
      expect(parse(panel({ border, details: ['$ echo hi'] })).kind).toBe('none');
    },
  );

  it('never parses a dialog for Pi', () => {
    for (const stem of ['omp-24-approval-a-dialog', 'omp-31-plan-review', 'omp-27-ask-a-dialog']) {
      expect(parse(loadScreen(stem), 'pi').kind).toBe('none');
    }
  });
});
