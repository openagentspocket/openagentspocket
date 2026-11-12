import '../programs';
import { describe, expect, it } from 'vitest';
import { loadScreen } from '../../blocked/golden-fixtures.testkit';
import type { AnsiScreen } from '../../blocked/screen';
import { TransportFailure } from '../../errors/transport-error';
import { FakeClock } from '../../hosts/cancellation';
import type { ChatAgentActivity } from '../model/types';
import { chatDeliveryPolicy } from './delivery-policy';
import { DELIVERY_CHECK_DELAY_MS } from './input-box';
import { sendPolicyFor } from './registry';
import { rulesFor, SGR, syntheticScreen } from './send.testkit';

const codex = sendPolicyFor('codex');
const claude = sendPolicyFor('claude');

/** Codex's composer holding a draft the user typed in the terminal. */
const draft = (text: string) =>
  syntheticScreen([
    '• Done.',
    '',
    `${SGR.bold}›${SGR.reset} ${text}`,
    '',
    `  ${SGR.bold}? ${SGR.reset}for shortcuts`,
  ]);

function setup(
  options: {
    activity?: ChatAgentActivity;
    screen?: () => AnsiScreen;
    program?: typeof codex;
    confirmSession?: () => Promise<string | null>;
    sendConcern?: (text: string, screen: AnsiScreen) => string | null;
    willReadScreen?: () => void;
    questionOpen?: () => boolean;
  } = {},
) {
  const reads = { count: 0 };
  const clock = new FakeClock();
  const policy = options.program ?? codex;
  const delivery = chatDeliveryPolicy(policy, {
    rules: rulesFor(policy),
    clock,
    activity: () => options.activity ?? 'idle',
    readScreen: async () => {
      reads.count += 1;
      return (options.screen ?? (() => draft('')))();
    },
    confirmSession: options.confirmSession,
    sendConcern: options.sendConcern,
    willReadScreen: options.willReadScreen,
    questionOpen: options.questionOpen,
  });
  return { delivery, reads, clock };
}

describe('Chat delivery policy', () => {
  it('lets the message go into an empty input box', async () => {
    const { delivery } = setup({ screen: () => loadScreen('codex-00-ready') });
    expect(await delivery.preflight?.('hello')).toBeUndefined();
  });

  it('says an open question waits for an answer, even when herdr reports idle', async () => {
    const { delivery } = setup({
      program: claude,
      screen: () => loadScreen('claude-39-c8-phone-question-titled-rule'),
      questionOpen: () => true,
    });
    expect(await delivery.preflight?.('hello')).toEqual({ kind: 'agentBlocked' });
  });

  it('keeps sending into an empty box when the open question is no longer on screen', async () => {
    const { delivery } = setup({
      screen: () => loadScreen('codex-00-ready'),
      questionOpen: () => true,
    });
    expect(await delivery.preflight?.('hello')).toBeUndefined();
  });

  it('refuses a Blocked Agent without reading the screen', async () => {
    const { delivery, reads } = setup({ activity: 'blocked' });
    expect(await delivery.preflight?.('hello')).toEqual({ kind: 'agentBlocked' });
    expect(reads.count).toBe(0);
  });

  it('reads the screen once, goes into an empty box and refuses a Blocked Agent unread', async () => {
    for (const [program, stem] of [
      [claude, 'claude-01-ready'],
      [codex, 'codex-00-ready'],
    ] as const) {
      const idle = setup({ program, screen: () => loadScreen(stem) });
      expect(await idle.delivery.preflight?.('hello')).toBeUndefined();
      expect(idle.reads.count).toBe(1);
      const blocked = setup({ program, activity: 'blocked', screen: () => loadScreen(stem) });
      expect(await blocked.delivery.preflight?.('hello')).toEqual({ kind: 'agentBlocked' });
      expect(blocked.reads.count).toBe(0);
    }
  });

  it('runs a session check after the Blocked check and before the screen read', async () => {
    const calls: string[] = [];
    const reason = 'Another conversation shows. Open this one in the terminal, then send again.';
    const refused = setup({
      screen: () => {
        calls.push('read');
        return loadScreen('codex-00-ready');
      },
      confirmSession: async () => {
        calls.push('check');
        return reason;
      },
    });
    expect(await refused.delivery.preflight?.('hello')).toEqual({ kind: 'inputNotReady', reason });
    expect(refused.reads.count).toBe(0);
    const passing = setup({
      screen: () => loadScreen('codex-00-ready'),
      confirmSession: async () => null,
    });
    expect(await passing.delivery.preflight?.('hello')).toBeUndefined();
    expect(passing.reads.count).toBe(1);
    const blocked = setup({ activity: 'blocked', confirmSession: async () => reason });
    expect(await blocked.delivery.preflight?.('hello')).toEqual({ kind: 'agentBlocked' });
  });

  it('holds the message when text is already in the box, with the program wording', async () => {
    const { delivery } = setup({ screen: () => draft('half a thought') });
    const refusal = await delivery.preflight?.('hello');
    expect(refusal).toEqual({
      kind: 'inputNotReady',
      reason: expect.stringContaining('such as a draft or a message Stop returned'),
    });
    const claudeBox = setup({
      program: claude,
      screen: () =>
        syntheticScreen([
          '⏺ Done.',
          '',
          SGR.claudeRule(60),
          '❯ typed in the terminal',
          SGR.claudeRule(60),
        ]),
    });
    expect(await claudeBox.delivery.preflight?.('hello')).toEqual({
      kind: 'inputNotReady',
      reason: "The Agent's input box already has text. Send or clear it in the terminal first.",
    });
  });

  it('names the Codex plan selector in the hold', async () => {
    const { delivery } = setup({ screen: () => loadScreen('codex-19-x3-implement-plan') });
    expect(await delivery.preflight?.('hello')).toEqual({
      kind: 'inputNotReady',
      reason: 'Codex is asking whether to implement the plan. Answer it in the terminal first.',
    });
    const dialog = setup({
      program: claude,
      screen: () => loadScreen('claude-02-c1-bash-blocked'),
    });
    expect(await dialog.delivery.preflight?.('hello')).toEqual({
      kind: 'inputNotReady',
      reason: 'The Agent is showing a dialog. Answer it in the terminal first.',
    });
  });

  it('holds with a reason when the screen shows no composer', async () => {
    const { delivery } = setup({ screen: () => syntheticScreen(['• Working (3s)']) });
    expect(await delivery.preflight?.('hello')).toEqual({
      kind: 'inputNotReady',
      reason: "Agentico can't find the Agent's input box on screen.",
    });
  });

  it('holds the message when the screen cannot be read', async () => {
    const plain = setup({
      screen: () => {
        throw new Error('offline');
      },
    });
    expect(await plain.delivery.preflight?.('hello')).toEqual({
      kind: 'inputNotReady',
      reason: "Agentico couldn't check the Agent's input box.",
    });
    const transport = setup({
      screen: () => {
        throw new TransportFailure({ kind: 'timedOut' });
      },
    });
    const refusal = await transport.delivery.preflight?.('hello');
    expect(refusal?.kind === 'inputNotReady' && refusal.reason).toContain(
      "Agentico couldn't check the Agent's input box. ",
    );
  });

  it('runs the send concern between the gate and the prompt, with the text as sent', async () => {
    const seen: string[] = [];
    const held = setup({
      screen: () => loadScreen('codex-00-ready'),
      sendConcern: (text) => {
        seen.push(text);
        return 'Your last message went to another session.';
      },
    });
    expect(await held.delivery.preflight?.('hello')).toEqual({
      kind: 'inputNotReady',
      reason: 'Your last message went to another session.',
    });
    expect(seen).toEqual(['hello ']);
    // A box that does not pass never reaches the concern.
    const notReached = setup({ screen: () => draft('typed'), sendConcern: () => 'never' });
    expect((await notReached.delivery.preflight?.('hello'))?.kind).toBe('inputNotReady');
  });

  it('registers the send before the screen read', async () => {
    const order: string[] = [];
    const { delivery } = setup({
      screen: () => {
        order.push('read');
        return loadScreen('codex-00-ready');
      },
      willReadScreen: () => order.push('register'),
    });
    await delivery.preflight?.('hello');
    expect(order).toEqual(['register', 'read']);
  });

  it('shapes what is sent and refused through the rules', () => {
    const { delivery } = setup();
    expect(delivery.route).toBe('chat');
    expect(delivery.insertsIntoAttachWhenBlocked).toBe(false);
    expect(delivery.outgoingText('hello  \n')).toBe('hello ');
    expect(delivery.validate('!ls')?.kind).toBe('unsafeText');
  });

  describe('the check after the send', () => {
    it('reads again after the delay and calls text left in the box not delivered', async () => {
      const { delivery, reads, clock } = setup({ screen: () => draft('hello') });
      const verified = delivery.verify?.('hello ');
      await clock.advance(DELIVERY_CHECK_DELAY_MS - 1);
      expect(reads.count).toBe(0);
      await clock.advance(1);
      expect(await verified).toBe(false);
      expect(reads.count).toBe(1);
    });

    it('counts an emptied box or an unreadable screen as sent', async () => {
      const emptied = setup({ screen: () => loadScreen('codex-00-ready') });
      const first = emptied.delivery.verify?.('hello ');
      await emptied.clock.advance(DELIVERY_CHECK_DELAY_MS);
      expect(await first).toBe(true);
      const unreadable = setup({
        screen: () => {
          throw new Error('offline');
        },
      });
      const second = unreadable.delivery.verify?.('hello ');
      await unreadable.clock.advance(DELIVERY_CHECK_DELAY_MS);
      expect(await second).toBe(true);
    });
  });
});
