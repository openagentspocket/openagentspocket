// Pi and Oh My Pi input boxes and declined compactions as Chat reads them (Swift PiChatTests), over
// synthetic screens and the captured goldens.

import { describe, expect, it } from 'vitest';
import { decodeAnsiScreen } from '../../blocked/ansi-decoder';
import { loadScreen } from '../../blocked/golden-fixtures.testkit';
import type { ChatAgentActivity } from '../model/types';
import { detectInputBox } from '../send/detect';
import { emptyBox, isSendable, preSendCheck } from '../send/input-box';
import { sendPolicyFor } from '../send/registry';
import { SGR } from '../send/send.testkit';

const pi = sendPolicyFor('pi');
const omp = sendPolicyFor('omp');
const detect = (text: string, policy = pi) => detectInputBox(decodeAnsiScreen(text), policy);
const captured = (stem: string, policy = pi) => detectInputBox(loadScreen(stem), policy);
const gate = (stem: string, activity: ChatAgentActivity, policy = pi) =>
  preSendCheck(captured(stem, policy), activity);
const rows = (...lines: string[]) => lines.join('\r\n');

describe('Pi input box', () => {
  const rule = '─'.repeat(40);
  const footer = '~/project (main)\r\n$0.000 0.0%/200k (auto)';

  it('passes an empty editor, but not a draft or a popup', () => {
    expect(detect(rows(rule, `${SGR.reverse} ${SGR.reset}`, rule, footer))).toEqual(emptyBox());
    expect(detect(rows(rule, `existing${SGR.reverse} ${SGR.reset}`, rule, footer))).toEqual({
      kind: 'text',
      text: 'existing',
    });
    expect(detect(rows(rule, `${SGR.reverse} ${SGR.reset}`, rule, '❯ /model', footer))).toEqual({
      kind: 'overlay',
      row: '❯ /model',
    });
    expect(isSendable(detect(rows(rule, '', rule, footer)))).toBe(false);
  });

  it('matches the footer by structure', () => {
    const editor = rows(rule, `${SGR.reverse} ${SGR.reset}`, rule);
    const read = (...below: string[]) => detect(rows(editor, ...below));
    expect(read('/srv/app (main)', '↑12k ↓3.4k R120k W12k CH90.0% $0.12...')).toEqual(emptyBox());
    expect(read('~/app', '?/200k (auto)    model', 'extension status')).toEqual(emptyBox());
    expect(read('→ compact   Compact the session', '~/app', '$0.000 0.0%/200k')).toEqual({
      kind: 'overlay',
      row: '→ compact   Compact the session',
    });
    expect(isSendable(read('~/app'))).toBe(false);
    expect(isSendable(read('~/app (mai...', 'grok-4.5 • high'))).toBe(false);
    expect(isSendable(read('~/app', '$0.000 0.0%/200k'))).toBe(true);
    const twoBlankRows = rows(
      rule,
      `${SGR.reverse} ${SGR.reset}`,
      '',
      rule,
      '~/app',
      '$0.000 0.0%/200k',
    );
    expect(isSendable(detect(twoBlankRows))).toBe(false);
  });

  it('accepts a steer while a turn runs, through the spinner rule', () => {
    const working = `── ⠸ Working ${'─'.repeat(28)}`;
    const cursor = `${SGR.reverse} ${SGR.reset}`;
    const foot = '~/app (main)\r\n$0.000 0.3%/200k (auto)';
    const read = (...lines: string[]) => detect(rows(...lines, foot));
    expect(read(working, cursor, rule)).toEqual(emptyBox());
    expect(
      read(' Steering: hi', ' ↳ Option+Up to edit all queued messages', working, cursor, rule),
    ).toEqual(emptyBox());
    expect(read(working, `more${cursor}`, rule)).toEqual({ kind: 'text', text: 'more' });
    // An answer's own rule above the editor is not its top border.
    expect(read(rule, 'answer', working, cursor, rule)).toEqual(emptyBox());
    // A scrolled editor's rule hides lines of a draft.
    expect(isSendable(read(`─── ↑ 2 more ${'─'.repeat(27)}`, cursor, rule))).toBe(false);
    // Oh My Pi draws no such rule.
    expect(isSendable(detect(rows(working, cursor, rule, foot), omp))).toBe(false);
  });

  it.each([
    'pi-06-empty-editor-119',
    'pi-08-auth-error-idle',
    'pi-13-skill-invoked',
    'pi-14-compact-0.25s',
    'pi-16-empty-editor-120-attached',
    'pi-17-empty-editor-40-attached',
  ])('reads an empty editor anywhere: %s', (stem) => {
    expect(captured(stem)).toEqual(emptyBox());
    expect(gate(stem, 'idle')).toEqual({ kind: 'send' });
  });

  it.each([
    ['pi-11-nonempty-after-popup-esc', '/pr'],
    ['pi-12-nonempty-editor', 'hello draft text'],
    ['pi-20-nonempty-40', 'a fairly long draft line that will\nwrap at forty columns'],
  ])('reads a draft as text: %s', (stem, draft) => {
    expect(captured(stem)).toEqual({ kind: 'text', text: draft });
  });

  it.each(['pi-09-slash-popup', 'pi-10-slash-pr-popup', 'pi-19-slash-popup-40'])(
    'reads the popup between border and footer as an overlay: %s',
    (stem) => {
      const state = captured(stem);
      expect(state.kind).toBe('overlay');
      if (state.kind === 'overlay') expect(state.row.startsWith('→ ')).toBe(true);
      expect(gate(stem, 'idle').kind).not.toBe('send');
    },
  );

  it('does not know the trust selector', () => {
    expect(captured('pi-03-trust-1s').kind).toBe('unknown');
  });

  it.each([
    'pi-31-working-empty-120',
    'pi-34-steer-queued-empty',
    'pi-35-steer-queued-tool',
    'pi-37-working-empty-40',
    'pi-39-compacting-empty',
  ])('reads a live working editor as empty, so Enter steers: %s', (stem) => {
    expect(captured(stem)).toEqual(emptyBox());
    expect(gate(stem, 'working')).toEqual({ kind: 'send' });
  });

  it.each([
    ['pi-32-working-draft-120', 'draft typed while working'],
    ['pi-33-retry-countdown-draft', 'draft typed while working'],
    ['pi-36-steer-back-in-editor', 'Queued steer: say MANGO.'],
    ['pi-38-working-draft-40', 'draft at forty cols'],
  ])('holds the send for a live draft: %s', (stem, draft) => {
    expect(captured(stem)).toEqual({ kind: 'text', text: draft });
    expect(gate(stem, 'working').kind).toBe('hold');
  });
});

describe('Oh My Pi input box', () => {
  const read = (text: string) => detect(text, omp);

  it('passes an empty box but not a multiline draft', () => {
    expect(read('╭── Ready ──────────────────────╮\r\n╰─ ▏                          ─╯')).toEqual(
      emptyBox(),
    );
    expect(
      isSendable(
        read(
          '╭──────────────────────────────╮\r\n│ first line                  │\r\n╰─ second▏                    ─╯',
        ),
      ),
    ).toBe(false);
    expect(isSendable(read('custom editor without a known border'))).toBe(false);
  });

  it.each(['────────────────44%────300K─', '──44%┃300K─'])(
    'recognizes the band with a hardware cursor before sending: %s',
    (gauge) => {
      const band = `${SGR.bg(15, 18, 22)} π > model > 📁 project ${SGR.reset}${gauge}`;
      const screen = decodeAnsiScreen(
        `${band}\r\n${SGR.fg(236, 70, 140)}╰─ ${SGR.reset}          `,
      );
      expect(detectInputBox(screen, omp)).toEqual(emptyBox());
      expect(preSendCheck(detectInputBox(screen, omp), 'idle')).toEqual({ kind: 'send' });
      expect(preSendCheck(detectInputBox(screen, omp), 'blocked')).toEqual({ kind: 'holdBlocked' });
    },
  );

  it('preserves drafts and refuses menus and incomplete chrome', () => {
    const band = `${SGR.bg(15, 18, 22)} π > 📁 project ${SGR.reset}────────────────44%────300K─`;
    expect(read(`${band}\r\n╰─ existing\r\n   second line`)).toEqual({
      kind: 'text',
      text: 'existing\nsecond line',
    });
    expect(read(`${band}\r\n╰─ !pwd`)).toEqual({ kind: 'shellMode', command: '!pwd' });
    expect(isSendable(read(`${band}\r\n╰─ \r\n❯ /model`))).toBe(false);
    expect(isSendable(read(`${band}\r\n╰─ \r\nEsc to cancel`))).toBe(false);
    expect(isSendable(read('╰─ '))).toBe(false);
    expect(isSendable(read('π > 📁 project ────────────\r\n╰─ '))).toBe(false);
    expect(isSendable(read(`${band.replace('π >', 'π N')}\r\n╰─ `))).toBe(false);
  });

  it.each([
    'omp-01-startup-empty-119',
    'omp-02-empty-120-before-first',
    'omp-03-empty-40-before-first',
    'omp-07-empty-40-after-first',
    'omp-08-empty-120-after-first',
    'omp-19-compact-nospace-1s',
    'omp-26-approval-b-idle',
    'omp-27-ask-e-idle',
    'omp-28-ask2-e-after-esc-2s',
    'omp-29-guard-f-idle',
    'omp-30-plan-mode-on',
    'omp-32-plan-after-esc',
  ])('reads the idle nerd band as empty: %s', (stem) => {
    expect(captured(stem, omp)).toEqual(emptyBox());
    expect(gate(stem, 'idle', omp)).toEqual({ kind: 'send' });
  });

  it.each([
    'omp-01-startup-empty-119',
    'omp-02-empty-120-before-first',
    'omp-03-empty-40-before-first',
  ])('does not take the first-message hint for a draft: %s', (stem) => {
    const screen = loadScreen(stem);
    const prompt = [...screen.rows].reverse().find((row) => row.text.startsWith('╰─ '));
    expect(prompt?.text).toContain('to change thinking effort');
    expect(detectInputBox(screen, omp)).toEqual(emptyBox());
  });

  it.each(['omp-05-qa-working-1s', 'omp-09-tool-working-3s'])(
    'holds a working band with its reason: %s',
    (stem) => {
      const state = captured(stem, omp);
      expect(state).toEqual({
        kind: 'disabled',
        reason: "Oh My Pi is working. Send once it's idle, or steer from the terminal.",
      });
      expect(gate(stem, 'working', omp)).toEqual({ kind: 'hold', state });
    },
  );

  it.each([
    ['omp-16-compact-space-after-enter', '/compact soft [focus]'],
    ['omp-29-guard-a-draft-while-working', 'my draft text'],
  ])('reads drafts and ghost text as text: %s', (stem, draft) => {
    expect(captured(stem, omp)).toEqual({ kind: 'text', text: draft });
  });

  it.each([
    'omp-14-slash-popup',
    'omp-17-compact-space-pre-enter-150ms',
    'omp-18-compact-nospace-150ms',
    'omp-21-after-exit-shell',
    'omp-33-after-exit-2',
  ])('reads popups and the shell below as an overlay: %s', (stem) => {
    expect(captured(stem, omp).kind).toBe('overlay');
  });

  it.each([
    'omp-23-approval-a-ctrlq-early',
    'omp-24-approval-a-dialog',
    'omp-24-approval-d-typed-abc',
    'omp-29-guard-b-ask-with-draft',
    'omp-29-guard-c-after-enter',
  ])('does not send under a panel above the band: %s', (stem) => {
    expect(['overlay', 'dialog']).toContain(captured(stem, omp).kind);
    expect(gate(stem, 'idle', omp).kind).not.toBe('send');
  });

  it('does not send over the plan review', () => {
    expect(gate('omp-31-plan-review', 'idle', omp).kind).not.toBe('send');
  });

  it('drops a prompt hint only when italic and set apart', () => {
    const band = `${SGR.fg(15, 18, 22)}\u{E0B6}${SGR.reset}${SGR.bg(15, 18, 22)} \u{F0D57} ${SGR.reset}──3%────272K─`;
    const readPrompt = (prompt: string) => read(`${band}\r\n${prompt}`);
    const hint = 'to change thinking effort';
    expect(readPrompt('╰─')).toEqual(emptyBox());
    expect(readPrompt(`╰─ hello      ${hint}`)).toEqual({
      kind: 'text',
      text: `hello      ${hint}`,
    });
    expect(readPrompt(`╰─ hello  ${SGR.italic}${hint}${SGR.reset}`)).toEqual({
      kind: 'text',
      text: 'hello',
    });
    expect(readPrompt(`╰─ hello ${SGR.italic}${hint}${SGR.reset}`)).toEqual({
      kind: 'text',
      text: `hello ${hint}`,
    });
    expect(readPrompt(`╰─    \u{F0636} ${SGR.italic}to see 2 running agents${SGR.reset}`)).toEqual(
      emptyBox(),
    );
    expect(readPrompt(`╰─    ${SGR.italic}something else${SGR.reset}`)).toEqual({
      kind: 'text',
      text: 'something else',
    });
  });

  it('keeps unknown band glyphs unrecognized', () => {
    const readBand = (segment: string) =>
      read(`${SGR.bg(15, 18, 22)}${segment} project ${SGR.reset}──3%────272K─\r\n╰─ `);
    expect(readBand('\u{E0B6} \u{2839} 1s')).toEqual({
      kind: 'disabled',
      reason: "Oh My Pi is working. Send once it's idle, or steer from the terminal.",
    });
    expect(isSendable(readBand('pi >'))).toBe(false);
    expect(isSendable(readBand('\u{E0B6} @ explore'))).toBe(false);
    expect(isSendable(readBand('\u{E0B6} \u{F0D58}'))).toBe(false);
  });
});

describe('declined compaction on screen', () => {
  const reader = (program: 'pi' | 'omp') => sendPolicyFor(program).compaction;

  it('sees a running compaction or a retry countdown', () => {
    const compaction = reader('pi');
    expect(compaction?.runningRow('⠼ Compacting context... (escape to cancel)')).toBe(true);
    expect(compaction?.runningRow('Retrying (1/3) in 2s... (escape to cancel)')).toBe(true);
    expect(compaction?.runningRow('Compaction failed: nothing')).toBe(false);
  });

  it('words a refusal with the program name', () => {
    expect(
      reader('pi')?.refusalText('Error: Compaction failed: Nothing to compact (session too small)'),
    ).toBe('Pi had nothing to compact.');
    expect(reader('omp')?.refusalText('Compaction failed: boom')).toBe(
      "Oh My Pi couldn't compact.",
    );
  });

  it('finds the failure row only just above the input box', () => {
    const rule = '─'.repeat(40);
    const failure = 'Error: Compaction failed: Nothing to compact (session too small)';
    const cursor = `${SGR.reverse} ${SGR.reset}`;
    const footer = '~/app (main)\r\n$0.000 0.0%/200k';
    const atBox = decodeAnsiScreen(rows('conversation', failure, '', rule, cursor, rule, footer));
    expect(reader('pi')?.latestFailure(atBox)?.text).toContain('Compaction failed:');
    const earlier = decodeAnsiScreen(
      rows(failure, 'later conversation', rule, cursor, rule, footer),
    );
    expect(reader('pi')?.latestFailure(earlier)).toBeNull();
  });
});
