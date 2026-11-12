import '../programs';
import { describe, expect, it } from 'vitest';
import { loadScreen } from '../../blocked/golden-fixtures.testkit';
import type { ComposerMessage } from '../../composer/progress';
import { ComposerStore } from '../../composer/store';
import { FakeClock } from '../../hosts/cancellation';
import { chatDeliveryPolicy } from './delivery-policy';
import { pendingEchoes, type SendStatus, sentMessages } from './echoes';
import { sendPolicyFor } from './registry';
import { rulesFor } from './send.testkit';

const rules = rulesFor('codex');
const message = (
  id: string,
  state: ComposerMessage['state'],
  route: ComposerMessage['route'] = 'chat',
  text = id,
): ComposerMessage => ({ id, text, route, state });
const sent = (progress: 'acknowledged' = 'acknowledged'): ComposerMessage['state'] => ({
  kind: 'delivered',
  progress,
});
const statuses = (entries: [string, SendStatus][]) => new Map(entries);

describe('Chat Composer echoes', () => {
  it("matches only Chat's messages, as herdr typed them", () => {
    const messages = [
      message('a', sent(), 'chat', '  hello  '),
      message('b', sent(), 'terminal', 'from the terminal'),
      message('c', { kind: 'sending' }, 'chat', '/compact'),
      message('d', { kind: 'undelivered' }, 'chat', 'x'),
      message('e', { kind: 'failed', text: 'no' }, 'chat', 'y'),
    ];
    expect(sentMessages(messages, rules)).toEqual([
      { id: 'a', text: '  hello ', isDelivered: true },
      { id: 'c', text: '/compact ', isDelivered: false },
      { id: 'd', text: 'x ', isDelivered: true },
      { id: 'e', text: 'y ', isDelivered: false },
    ]);
  });

  it('gives way to the entry once the transcript recorded the message', () => {
    const messages = [message('a', sent()), message('b', sent())];
    const echoes = pendingEchoes(
      messages,
      statuses([
        ['a', { kind: 'recorded' }],
        ['b', { kind: 'awaiting' }],
      ]),
    );
    expect(echoes).toEqual([{ id: 'b', text: 'b', state: { kind: 'sent' } }]);
  });

  it('gives a message the tracker has not seen no echo, unless it is still sending', () => {
    const echoes = pendingEchoes(
      [message('a', sent()), message('b', { kind: 'sending' })],
      statuses([]),
    );
    expect(echoes).toEqual([{ id: 'b', text: 'b', state: { kind: 'sending' } }]);
  });

  it('shows only the latest failure', () => {
    const failed = (id: string) => message(id, { kind: 'failed', text: 'Offline' });
    expect(pendingEchoes([failed('a'), failed('b')], statuses([])).map((echo) => echo.id)).toEqual([
      'b',
    ]);
    expect(pendingEchoes([failed('a'), failed('b')], statuses([]))[0]?.state).toEqual({
      kind: 'failed',
      reason: 'Offline',
    });
  });

  it.each([
    [{ kind: 'overdue' }, { kind: 'unconfirmed' }],
    [{ kind: 'returned' }, { kind: 'notDelivered' }],
    [{ kind: 'discarded' }, { kind: 'discarded' }],
    [
      { kind: 'refused', reason: 'Nothing to compact.' },
      { kind: 'refused', reason: 'Nothing to compact.' },
    ],
    [{ kind: 'misdirected' }, { kind: 'misdirected' }],
  ] as [SendStatus, unknown][])(
    'words a delivered message the tracker says is %j',
    (status, state) => {
      expect(pendingEchoes([message('a', sent())], statuses([['a', status]]))).toEqual([
        { id: 'a', text: 'a', state },
      ]);
    },
  );

  it('shows text left in the input box as not delivered, outranked by a later look at the box', () => {
    const undelivered = message('a', { kind: 'undelivered' });
    expect(pendingEchoes([undelivered], statuses([['a', { kind: 'awaiting' }]]))[0]?.state).toEqual(
      {
        kind: 'notDelivered',
      },
    );
    expect(
      pendingEchoes([undelivered], statuses([['a', { kind: 'discarded' }]]))[0]?.state,
    ).toEqual({
      kind: 'discarded',
    });
    expect(
      pendingEchoes([undelivered], statuses([['a', { kind: 'misdirected' }]]))[0]?.state,
    ).toEqual({
      kind: 'misdirected',
    });
    expect(pendingEchoes([undelivered], statuses([]))).toEqual([]);
  });

  it('lets a discarded send give way to a newer message', () => {
    const messages = [message('a', sent()), message('b', sent())];
    const echoes = pendingEchoes(
      messages,
      statuses([
        ['a', { kind: 'discarded' }],
        ['b', { kind: 'awaiting' }],
      ]),
    );
    expect(echoes.map((echo) => echo.id)).toEqual(['b']);
  });

  it("is fed by the Composer's own messages through the Chat delivery policy", async () => {
    const clock = new FakeClock();
    const policy = chatDeliveryPolicy(sendPolicyFor('codex'), {
      rules,
      clock,
      activity: () => 'idle',
      readScreen: async () => loadScreen('codex-00-ready'),
    });
    const store = new ComposerStore({
      target: 'p1',
      prompt: async () => undefined,
      clock,
      initialStatus: 'idle',
    });
    store.replaceDraft('  fix the tests  ');
    expect((await store.send(policy)).kind).toBe('deliveredViaPrompt');
    const { messages } = store.getSnapshot();
    expect(sentMessages(messages, rules)).toEqual([
      { id: messages[0]?.id, text: '  fix the tests ', isDelivered: true },
    ]);
  });
});
