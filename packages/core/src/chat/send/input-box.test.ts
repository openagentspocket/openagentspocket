import '../programs';
import { describe, expect, it } from 'vitest';
import { loadScreen } from '../../blocked/golden-fixtures.testkit';
import { detectInputBox } from './detect';
import {
  DELIVERY_CHECK_DELAY_MS,
  deliveryVerdict,
  emptyBox,
  type InputBoxState,
  isSendable,
  preSendCheck,
} from './input-box';
import { sendPolicyFor } from './registry';
import { SGR, syntheticScreen } from './send.testkit';

const claude = sendPolicyFor('claude');
const codex = sendPolicyFor('codex');

const HOLDING: InputBoxState[] = [
  { kind: 'text', text: 'draft' },
  { kind: 'shellMode', command: 'ls' },
  { kind: 'shellMode', command: '' },
  { kind: 'disabled', reason: 'Input disabled.' },
  { kind: 'overlay', row: '/compact' },
  { kind: 'dialog', title: null },
  { kind: 'unknown', reason: "Claude's input box is not on screen." },
  { kind: 'noComposer', reason: 'Open this conversation in the terminal first.' },
];

describe('Pre-send gate', () => {
  it('passes an empty box unless the Agent is Blocked', () => {
    expect(preSendCheck(emptyBox(), 'idle')).toEqual({ kind: 'send' });
    expect(preSendCheck(emptyBox('Ask Codex to do anything'), 'working')).toEqual({ kind: 'send' });
    expect(preSendCheck(emptyBox(), 'unknown')).toEqual({ kind: 'send' });
    expect(preSendCheck(emptyBox(), 'blocked')).toEqual({ kind: 'holdBlocked' });
  });

  it.each(HOLDING)('holds the message for %j', (state) => {
    expect(isSendable(state)).toBe(false);
    expect(preSendCheck(state, 'idle')).toEqual({ kind: 'hold', state });
    expect(preSendCheck(state, 'blocked')).toEqual({ kind: 'holdBlocked' });
  });

  it('reads the captured screens', () => {
    const gate = (stem: string, activity: Parameters<typeof preSendCheck>[1]) =>
      preSendCheck(
        detectInputBox(loadScreen(stem), stem.startsWith('codex') ? codex : claude),
        activity,
      );
    expect(gate('claude-01-ready', 'idle')).toEqual({ kind: 'send' });
    expect(gate('codex-00-ready', 'idle')).toEqual({ kind: 'send' });
    expect(gate('claude-02-c1-bash-blocked', 'blocked')).toEqual({ kind: 'holdBlocked' });
    expect(gate('claude-02-c1-bash-blocked', 'unknown')).toEqual({
      kind: 'hold',
      state: { kind: 'dialog', title: null },
    });
    // The composer stays in view while asynchronous questions wait.
    expect(gate('codex-08-x4-async-collapsed', 'working')).toEqual({
      kind: 'hold',
      state: { kind: 'dialog', title: null },
    });
    // herdr reports Codex idle under its plan selector.
    expect(gate('codex-19-x3-implement-plan', 'idle')).toEqual({
      kind: 'hold',
      state: { kind: 'dialog', title: 'Implement this plan?' },
    });
  });
});

describe('Delivery check', () => {
  it('reads an emptied box, a dialog or Blocked as delivered', () => {
    expect(deliveryVerdict(emptyBox(), 'working')).toEqual({ kind: 'delivered' });
    expect(deliveryVerdict({ kind: 'dialog', title: null }, 'unknown')).toEqual({
      kind: 'delivered',
    });
    expect(deliveryVerdict({ kind: 'unknown', reason: 'why' }, 'blocked')).toEqual({
      kind: 'delivered',
    });
  });

  it('reads text left in the box as not delivered, with the text', () => {
    expect(deliveryVerdict({ kind: 'text', text: 'fix the tests' }, 'idle')).toEqual({
      kind: 'notDelivered',
      text: 'fix the tests',
    });
    expect(deliveryVerdict({ kind: 'shellMode', command: 'ls' }, 'working')).toEqual({
      kind: 'notDelivered',
      text: 'ls',
    });
  });

  it.each([
    { kind: 'shellMode', command: '' },
    { kind: 'disabled', reason: 'Input disabled.' },
    { kind: 'overlay', row: '/compact' },
    { kind: 'unknown', reason: "Codex's composer is not on screen." },
    { kind: 'noComposer', reason: 'Open this conversation in the terminal first.' },
  ] as InputBoxState[])('leaves the message marked as sent for %j', (state) => {
    expect(deliveryVerdict(state, 'idle')).toEqual({ kind: 'unconfirmed' });
  });

  it('reads the captured screens after sending', () => {
    const verdict = (stem: string, activity: Parameters<typeof preSendCheck>[1]) =>
      deliveryVerdict(
        detectInputBox(loadScreen(stem), stem.startsWith('codex') ? codex : claude),
        activity,
      );
    expect(verdict('claude-29-c3-after-immediate', 'idle')).toEqual({ kind: 'delivered' });
    expect(verdict('claude-02-c1-bash-blocked', 'unknown')).toEqual({ kind: 'delivered' });
    expect(verdict('codex-03-x2-after-esc', 'idle')).toEqual({ kind: 'delivered' });
  });

  it('re-reads after three seconds', () => {
    expect(DELIVERY_CHECK_DELAY_MS).toBe(3000);
  });

  it('lets a program that may refill its box say nothing about other text', () => {
    const left: InputBoxState = { kind: 'text', text: 'the sent message' };
    const options = { mayRefillAfterSend: true };
    // The sent message's own text left behind: not delivered.
    expect(
      deliveryVerdict(left, 'idle', { ...options, sent: 'please send the sent message now' }),
    ).toEqual({ kind: 'notDelivered', text: 'the sent message' });
    // Other text: a stashed draft restored, which says nothing.
    expect(
      deliveryVerdict({ kind: 'text', text: 'something else' }, 'idle', {
        ...options,
        sent: 'a message',
      }),
    ).toEqual({
      kind: 'unconfirmed',
    });
    // Without the sent text, or for a program that never refills, the verdict is the plain one.
    expect(deliveryVerdict({ kind: 'text', text: 'x' }, 'idle', options)).toEqual({
      kind: 'notDelivered',
      text: 'x',
    });
    expect(deliveryVerdict({ kind: 'text', text: 'x' }, 'idle', { sent: 'y' })).toEqual({
      kind: 'notDelivered',
      text: 'x',
    });
  });
});

describe('Input box detection', () => {
  const claudeEmpty = [
    'claude-01-ready',
    'claude-15-c9-enterplanmode',
    'claude-21-c6-after',
    'claude-23-c7-after-esc',
    'claude-25-c8-after-digit3',
    'claude-29-c3-after-immediate',
  ];
  const codexEmpty = ['codex-00-ready', 'codex-03-x2-after-esc', 'codex-11-x4-after-skip'];

  it.each(claudeEmpty)("reads Claude's empty box: %s", (stem) => {
    expect(detectInputBox(loadScreen(stem), claude)).toEqual(emptyBox());
  });

  it.each(codexEmpty)("reads Codex's empty composer: %s", (stem) => {
    expect(detectInputBox(loadScreen(stem), codex)).toEqual(emptyBox('Ask Codex to do anything'));
  });

  it('reads a dialog in place of the box, naming Codex plan selector', () => {
    expect(detectInputBox(loadScreen('claude-02-c1-bash-blocked'), claude)).toEqual({
      kind: 'dialog',
      title: null,
    });
    expect(detectInputBox(loadScreen('codex-19-x3-implement-plan'), codex)).toEqual({
      kind: 'dialog',
      title: 'Implement this plan?',
    });
  });

  it('only an empty box is sendable', () => {
    expect(isSendable(emptyBox())).toBe(true);
    expect(isSendable({ kind: 'text', text: 'draft' })).toBe(false);
    expect(isSendable({ kind: 'dialog', title: null })).toBe(false);
    expect(isSendable({ kind: 'unknown', reason: 'why' })).toBe(false);
  });

  describe('Claude (synthetic)', () => {
    const cursor = `${SGR.reverse} ${SGR.reset}`;
    const box = (inputRows: string[], below: string[] = []) =>
      detectInputBox(
        syntheticScreen([
          '⏺ Done.',
          '',
          SGR.claudeRule(60),
          ...inputRows,
          SGR.claudeRule(60),
          ...below,
          `  ${SGR.claudeInactive}⏸ manual mode on${SGR.reset}`,
        ]),
        claude,
      );

    it('reads typed text around or before the cursor', () => {
      expect(box([`❯ fix the tests${cursor}`])).toEqual({ kind: 'text', text: 'fix the tests' });
      expect(box([`❯ fix ${SGR.reverse}t${SGR.reset}he tests`])).toEqual({
        kind: 'text',
        text: 'fix the tests',
      });
      expect(box(['❯ first line', `  second line${cursor}`])).toEqual({
        kind: 'text',
        text: 'first line\nsecond line',
      });
    });

    it('reads a placeholder as empty, except the queued-message edit hint', () => {
      const hint = (text: string) =>
        `❯ ${SGR.reverse}${text.slice(0, 1)}${SGR.reset}${SGR.dim}${text.slice(1)}${SGR.reset}`;
      expect(box([hint('Try "fix lint errors"')])).toEqual(emptyBox('Try "fix lint errors"'));
      expect(box([hint('Press Enter to edit the selected message')])).toEqual({
        kind: 'overlay',
        row: 'Press Enter to edit the selected message',
      });
      expect(box([hint('Something new')])).toEqual(emptyBox('Something new'));
    });

    it('reads a prompt suggestion as an empty box', () => {
      const suggestion = 'draft the email to the partner team';
      expect(box([`❯ ${SGR.reset}${SGR.dim}${suggestion}${SGR.reset}`])).toEqual(
        emptyBox(suggestion),
      );
    });

    it('reads shell mode, empty or with a command', () => {
      expect(box([`! ls -la${cursor}`])).toEqual({ kind: 'shellMode', command: 'ls -la' });
      expect(box([`! ${cursor}`])).toEqual({ kind: 'shellMode', command: '' });
    });

    it('reads suggestions under an empty box as an overlay', () => {
      const row = '  /compact     Clear conversation history but keep a summary';
      expect(box([`❯ ${cursor}`], [row])).toEqual({ kind: 'overlay', row: row.trim() });
    });

    it('does not take a past prompt on its background for the box', () => {
      const unknown = { kind: 'unknown', reason: "Claude's input box is not on screen." };
      expect(box([`${SGR.bg(55, 55, 55)}❯ fix the tests${SGR.reset}`])).toEqual(unknown);
      expect(
        detectInputBox(syntheticScreen(['⏺ Working on it…', '', '  ⎿  Running tests']), claude),
      ).toEqual(unknown);
    });
  });

  describe('Codex (synthetic)', () => {
    const prompt = `${SGR.bold}›${SGR.reset} `;
    const composer = (rows: string[], extra: { above?: string[]; below?: string[] } = {}) =>
      detectInputBox(
        syntheticScreen([
          '• Done.',
          '',
          ...(extra.above ?? []),
          ...rows,
          '',
          ...(extra.below ?? []),
          `  ${SGR.bold}? ${SGR.reset}for shortcuts`,
        ]),
        codex,
      );
    const placeholder = (text: string) => `${prompt}${SGR.dim}${text}${SGR.reset}`;

    it('reads a draft, on one row or wrapped', () => {
      expect(composer([`${prompt}fix the tests`])).toEqual({ kind: 'text', text: 'fix the tests' });
      expect(composer([`${prompt}first line`, '  second line'])).toEqual({
        kind: 'text',
        text: 'first line\nsecond line',
      });
    });

    it('reads placeholders, including one cut short', () => {
      expect(composer([placeholder('Ask a follow-up question')])).toEqual(
        emptyBox('Ask a follow-up question'),
      );
      expect(composer([placeholder('Ask Codex to do a…')])).toEqual(emptyBox('Ask Codex to do a…'));
      expect(composer([placeholder('Something else')])).toEqual({
        kind: 'unknown',
        reason: 'The composer shows “Something else”, which Agentico does not know.',
      });
    });

    it('reads shell mode and disabled input', () => {
      expect(composer([`${SGR.bold}${SGR.fg(255, 100, 100)}!${SGR.reset} ls`])).toEqual({
        kind: 'shellMode',
        command: 'ls',
      });
      expect(composer([`${SGR.dim}› Input disabled.${SGR.reset}`])).toEqual({
        kind: 'disabled',
        reason: 'Input disabled.',
      });
    });

    it('reads hints and popups around an empty composer as an overlay', () => {
      const empty = placeholder('Ask Codex to do anything');
      expect(composer([empty], { below: ['  esc again to edit previous message'] })).toEqual({
        kind: 'overlay',
        row: 'esc again to edit previous message',
      });
      expect(
        composer([empty], {
          above: ['  /model    choose what model to use', '  /review   review my changes', ''],
        }),
      ).toEqual({ kind: 'overlay', row: '/review   review my changes' });
    });

    it('reads no composer on screen', () => {
      const screen = syntheticScreen([
        '• Working (3s • esc to interrupt)',
        '',
        `${SGR.bold}${SGR.dim}›${SGR.reset} an earlier prompt`,
      ]);
      expect(detectInputBox(screen, codex)).toEqual({
        kind: 'unknown',
        reason: "Codex's composer is not on screen.",
      });
    });
  });
});
