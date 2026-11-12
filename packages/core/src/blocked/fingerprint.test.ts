import '../chat/programs';
import { describe, expect, it } from 'vitest';
import type { ChatProgram } from '../chat/model/types';
import {
  type DialogFingerprint,
  dialogFingerprint,
  excerptFingerprint,
  fingerprintsMatch,
  mergeFingerprints,
} from './fingerprint';
import { loadScreen } from './golden-fixtures.testkit';
import { parseBlockedDialog } from './programs';
import { type BlockedDialogKind, type DialogOption, makeOption } from './types';

function fingerprintOf(stem: string): DialogFingerprint {
  const program = stem.startsWith('codex') ? 'codex' : 'claude';
  const result = parseBlockedDialog(loadScreen(stem), program);
  if (result.kind !== 'dialog') throw new Error(`${stem} did not parse as a dialog`);
  return result.dialog.fingerprint;
}

const yesNo = [
  makeOption({ ordinal: 1, number: 1, label: 'Yes', role: 'approve' }),
  makeOption({ ordinal: 2, number: 2, label: 'No', role: 'decline' }),
];

function bash(
  over: {
    program?: ChatProgram;
    kind?: BlockedDialogKind;
    sourceSuffix?: string | null;
    body?: string[];
    progress?: string | null;
    options?: DialogOption[];
  } = {},
): DialogFingerprint {
  return dialogFingerprint({
    program: over.program ?? 'claude',
    kind: over.kind ?? 'claudeBash',
    title: 'Bash command',
    sourceSuffix: over.sourceSuffix ?? null,
    body: over.body ?? ['touch a.txt'],
    progress: over.progress ?? null,
    options: over.options ?? yesNo,
  });
}

describe('dialog fingerprint', () => {
  it.each([
    ['claude-02-c1-bash-blocked', 'claude-03-c1-focus-no'],
    ['claude-02-c1-bash-blocked', 'claude-05-c1-pasted-feedback'],
    ['claude-08-c4-auq-q1', 'claude-10-c4-focus-next'],
    ['claude-16-c6-exitplan-1', 'claude-18-c6-pasted'],
    ['codex-05-x3-q2', 'codex-07-x3-q2-pasted'],
  ])('focus, notes, checks and typed text keep it (%s, %s)', (first, second) => {
    expect(fingerprintOf(first)).toEqual(fingerprintOf(second));
  });

  it.each([
    ['claude-30-par-first', 'claude-31-par-second'],
    ['codex-13-par-first', 'codex-14-par-second'],
    ['claude-16-c6-exitplan-1', 'claude-19-c6-exitplan-2'],
    ['claude-08-c4-auq-q1', 'claude-11-c4-q2'],
    ['codex-04-x3-q1', 'codex-05-x3-q2'],
    ['codex-09-x4-expanded', 'codex-10-x4-after-digit'],
  ])('another request, plan or page changes it (%s, %s)', (first, second) => {
    expect(fingerprintOf(first)).not.toEqual(fingerprintOf(second));
  });

  it('ignores whitespace and apostrophe style', () => {
    const plain = bash({
      options: [
        makeOption({
          ordinal: 1,
          number: 1,
          label: "Yes, and don't ask again",
          role: 'approvePersistent',
        }),
      ],
    });
    const typographic = bash({
      body: ['touch  a.txt'],
      options: [
        makeOption({
          ordinal: 1,
          number: 1,
          label: 'Yes, and don’t ask again',
          role: 'approvePersistent',
        }),
      ],
    });
    expect(plain).toEqual(typographic);
    expect(bash({ body: ['touch a.txt'] })).not.toEqual(bash({ body: ['touch b.txt'] }));
  });

  it('counts program, kind, source, progress and numbering', () => {
    const base = bash();
    expect(base).toEqual(bash());
    expect(base).not.toEqual(bash({ program: 'codex' }));
    expect(base).not.toEqual(bash({ kind: 'claudeFileEdit' }));
    expect(base).not.toEqual(bash({ sourceSuffix: 'from the Explore agent' }));
    expect(base).not.toEqual(bash({ progress: 'Size' }));
    expect(base).not.toEqual(
      bash({
        options: [
          yesNo[0] as DialogOption,
          makeOption({ ordinal: 2, number: 3, label: 'No', role: 'decline' }),
        ],
      }),
    );
  });

  it('reads a text field the same empty or typed', () => {
    const question = (input: DialogOption['input']) =>
      bash({
        kind: 'claudeQuestion',
        options: [
          makeOption({ ordinal: 1, number: 1, label: 'Small', role: 'answer' }),
          makeOption({ ordinal: 2, number: 2, label: 'Type something.', role: 'otherText', input }),
        ],
      });
    expect(question({ kind: 'placeholder', text: 'Type something.' })).toEqual(
      question({ kind: 'text', text: 'Medium' }),
    );
  });

  it('is 64 lowercase hex digits', () => {
    expect(fingerprintOf('claude-02-c1-bash-blocked').value).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches reads whose shown request lines agree, and merges the ones a read lacks', () => {
    const base = bash();
    const withRequest = { ...base, requestLines: 'aa', ruleLines: null };
    const otherRequest = { ...base, requestLines: 'bb', ruleLines: null };
    expect(fingerprintsMatch(base, withRequest)).toBe(true);
    expect(fingerprintsMatch(withRequest, otherRequest)).toBe(false);
    expect(mergeFingerprints(base, withRequest).requestLines).toBe('aa');
    expect(fingerprintsMatch(base, { ...base, value: 'x' })).toBe(false);
  });

  it('leaves the pointer glyph out of an excerpt fingerprint', () => {
    expect(excerptFingerprint('claude', ['❯1. Yes', '2. No'])).toEqual(
      excerptFingerprint('claude', ['1. Yes', '2. No']),
    );
    expect(excerptFingerprint('claude', ['1. Yes'])).not.toEqual(
      excerptFingerprint('codex', ['1. Yes']),
    );
  });
});
