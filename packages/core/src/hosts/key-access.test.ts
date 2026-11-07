import { describe, expect, it } from 'vitest';
import { FakeClock } from './cancellation';
import {
  KEY_ACCESS_REUSE_MS,
  KeyAccessGate,
  type KeyAccessResult,
  KeyPromptInterrupted,
} from './key-access';

function gate(results: KeyAccessResult[], required = true) {
  const clock = new FakeClock();
  const state = { asked: 0 };
  const subject = new KeyAccessGate({
    isRequired: () => required,
    authenticate: async () => {
      state.asked += 1;
      return results.shift() ?? 'success';
    },
    clock,
  });
  return { subject, clock, state };
}

const notConfirmed = { error: { kind: 'keyAccessNotConfirmed' } };

describe('KeyAccessGate', () => {
  it('asks nothing while the setting is off', async () => {
    const { subject, state } = gate([], false);
    await subject.authorize();
    expect(state.asked).toBe(0);
  });

  it('reuses one confirmation inside the window and asks again after it', async () => {
    const { subject, clock, state } = gate([]);
    await subject.authorize();
    await clock.advance(KEY_ACCESS_REUSE_MS - 1);
    await subject.authorize();
    expect(state.asked).toBe(1);
    await clock.advance(1);
    await subject.authorize();
    expect(state.asked).toBe(2);
  });

  it('shows one prompt to Hosts connecting at the same time', async () => {
    const { subject, state } = gate([]);
    await Promise.all([subject.authorize(), subject.authorize(), subject.authorize()]);
    expect(state.asked).toBe(1);
  });

  it('refuses the key when the owner fails or cancels, and keeps no confirmation', async () => {
    for (const result of ['denied', 'cancelled'] as const) {
      const { subject, state } = gate([result]);
      await expect(subject.authorize()).rejects.toMatchObject(notConfirmed);
      await subject.authorize();
      expect(state.asked).toBe(2);
    }
  });

  it('says it would ask only when the setting is on and no confirmation covers the key', async () => {
    expect(gate([], false).subject.wouldAsk()).toBe(false);
    const { subject, clock } = gate([]);
    expect(subject.wouldAsk()).toBe(true);
    await subject.authorize();
    expect(subject.wouldAsk()).toBe(false);
    await clock.advance(KEY_ACCESS_REUSE_MS);
    expect(subject.wouldAsk()).toBe(true);
  });

  it('tells an interrupted prompt from a refusal, keeping no confirmation', async () => {
    const { subject, state } = gate(['interrupted']);
    await expect(subject.authorize()).rejects.toBeInstanceOf(KeyPromptInterrupted);
    await subject.authorize();
    expect(state.asked).toBe(2);
  });

  it('stands open on a device that cannot ask', async () => {
    const { subject } = gate(['unavailable']);
    await expect(subject.authorize()).resolves.toBeUndefined();
  });
});
