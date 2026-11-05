import { describe, expect, it } from 'vitest';
import { decodeAnsiScreen } from '../../blocked/ansi-decoder';
import { ESCAPE_WAIT } from '../../composer/stop';
import { AgentKeysQueue } from './agent-keys';
import type { StopPlanSpec } from './policy';
import { sendPolicyFor, terminalStopAvailable } from './registry';
import {
  composerInterrupt,
  ESCAPE_STOP,
  STOP_UNREACHABLE,
  STOP_UNREADABLE_SCREEN,
} from './stop-plan';

function recorder(options: { fail?: boolean } = {}) {
  const events: string[] = [];
  const sent: string[][] = [];
  const keys = new AgentKeysQueue(async (names) => {
    events.push(names.join('+'));
    if (options.fail) throw new Error('offline');
    sent.push([...names]);
  });
  return {
    events,
    sent,
    keys,
    context: async () => {
      events.push('read');
      return { screen: decodeAnsiScreen('screen'), activity: 'working' as const };
    },
  };
}

describe('Chat Stop plan', () => {
  it.each(['claude', 'codex'] as const)(
    'presses one Esc and waits three seconds for %s',
    (program) => {
      const { stop } = sendPolicyFor(program);
      expect(stop.keys).toEqual(['esc']);
      expect(stop.screenGuard).toBeUndefined();
      expect(stop.wait).toEqual(ESCAPE_WAIT);
      expect(stop.wait.windowMs).toBe(3000);
      expect(stop.wait.unconfirmedNotice).toBe('Esc went, but the Agent still shows Working.');
      expect(stop.wait.minimumGapMs).toBeUndefined();
      expect(stop.accessibilityHint).toBe('Presses Esc to interrupt the Agent');
      expect(stop).toBe(ESCAPE_STOP);
    },
  );

  it('sends every key of an unguarded plan in one request, without reading', async () => {
    const r = recorder();
    const plan: StopPlanSpec = {
      keys: ['esc', 'esc'],
      wait: ESCAPE_WAIT,
      accessibilityHint: 'Presses Esc twice',
    };
    const interrupt = composerInterrupt(plan, r);
    expect(await interrupt.perform()).toEqual({ kind: 'sent' });
    expect(r.sent).toEqual([['esc', 'esc']]);
    expect(r.events).toEqual(['esc+esc']);
  });

  it('lets a guard see the screen and status, and refuse', async () => {
    const r = recorder();
    const plan: StopPlanSpec = {
      keys: ['ctrl+c'],
      wait: ESCAPE_WAIT,
      accessibilityHint: 'Presses Ctrl+C',
      screenGuard: ({ screen, activity }) =>
        activity === 'working' && screen.rows.length > 0
          ? { kind: 'refuse', reason: 'Ctrl+C would only clear the draft.' }
          : { kind: 'press' },
    };
    const outcome = await composerInterrupt(plan, r).perform();
    expect(outcome).toEqual({ kind: 'failed', message: 'Ctrl+C would only clear the draft.' });
    expect(r.sent).toEqual([]);
  });

  it('sends the keys once the guard allows, reading first', async () => {
    const r = recorder();
    const plan: StopPlanSpec = {
      keys: ['ctrl+c'],
      wait: ESCAPE_WAIT,
      accessibilityHint: '',
      screenGuard: () => ({ kind: 'press' }),
    };
    expect(await composerInterrupt(plan, r).perform()).toEqual({ kind: 'sent' });
    expect(r.events).toEqual(['read', 'ctrl+c']);
  });

  it('presses nothing when the screen cannot be read', async () => {
    const r = recorder();
    const plan: StopPlanSpec = {
      keys: ['ctrl+c'],
      wait: ESCAPE_WAIT,
      accessibilityHint: '',
      screenGuard: () => ({ kind: 'press' }),
    };
    const outcome = await composerInterrupt(plan, {
      keys: r.keys,
      context: async () => {
        throw new Error('no screen');
      },
    }).perform();
    expect(outcome).toEqual({ kind: 'failed', message: STOP_UNREADABLE_SCREEN });
    expect(r.sent).toEqual([]);
  });

  it('says the Agent may still be working when the request failed', async () => {
    const r = recorder({ fail: true });
    expect(await composerInterrupt(ESCAPE_STOP, r).perform()).toEqual({
      kind: 'failed',
      message: STOP_UNREACHABLE,
    });
  });

  it('carries the plan to the Composer', () => {
    const interrupt = composerInterrupt(ESCAPE_STOP, recorder());
    expect(interrupt.wait).toBe(ESCAPE_WAIT);
    expect(interrupt.accessibilityHint).toBe('Presses Esc to interrupt the Agent');
  });

  it('shows the terminal Stop for a program whose Esc interrupts', () => {
    expect(terminalStopAvailable('claude')).toBe(true);
    expect(terminalStopAvailable('codex')).toBe(true);
    // A program Chat does not know keeps Stop.
    expect(terminalStopAvailable('gemini')).toBe(true);
  });
});

describe('Chat Agent keys', () => {
  it('delivers keys in the order pressed, one request at a time', async () => {
    const order: string[] = [];
    let release: () => void = () => undefined;
    const keys = new AgentKeysQueue(async (names) => {
      order.push(`start ${names[0]}`);
      if (names[0] === 'a') await new Promise<void>((resolve) => (release = resolve));
      order.push(`end ${names[0]}`);
    });
    const first = keys.deliver(['a']);
    const second = keys.deliver(['b']);
    await Promise.resolve();
    expect(order).toEqual(['start a']);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['start a', 'end a', 'start b', 'end b']);
  });

  it('shows a failure until a key arrives, and sends nothing for no keys', async () => {
    let fail = true;
    const keys = new AgentKeysQueue(async () => {
      if (fail) throw new Error('down');
    });
    expect(await keys.deliver(['a'])).toEqual({ kind: 'failed' });
    expect(keys.failure).toContain("Couldn't reach the Agent");
    fail = false;
    expect(await keys.deliver(['a'])).toEqual({ kind: 'sent' });
    expect(keys.failure).toBeNull();
    expect(await keys.deliver([])).toEqual({ kind: 'failed' });
  });

  it('runs a check once earlier keys have gone, and a reason withholds the keys', async () => {
    const sent: string[][] = [];
    const keys = new AgentKeysQueue(async (names) => {
      sent.push([...names]);
    });
    const earlier = keys.deliver(['a']);
    const seen: string[][] = [];
    const checked = keys.deliver(['b'], async () => {
      seen.push([...sent.flat()]);
      return 'not now';
    });
    await earlier;
    expect(await checked).toEqual({ kind: 'withheld', reason: 'not now' });
    expect(seen).toEqual([['a']]);
    expect(sent).toEqual([['a']]);
    expect(keys.failure).toBeNull();
  });
});
