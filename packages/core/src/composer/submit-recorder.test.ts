import { describe, expect, it } from 'vitest';
import { FakeClock } from '../hosts/cancellation';
import type { ComposerDeliveryPolicy } from './policy';
import { ComposerStore, type ComposerSubmitRecorder } from './store';

interface Rig {
  store: ComposerStore;
  calls: { target: string; text: string }[];
  failures: unknown[];
  gate?: Promise<void>;
}

function rig(): Rig {
  const state: Rig = { store: undefined as never, calls: [], failures: [] };
  state.store = new ComposerStore({
    target: 'w1:p1',
    clock: new FakeClock(),
    prompt: async (params) => {
      state.calls.push(params);
      if (state.gate) await state.gate;
      const failure = state.failures.shift();
      if (failure) throw failure;
    },
  });
  return state;
}

const chatPolicy = (over: Partial<ComposerDeliveryPolicy>): ComposerDeliveryPolicy => ({
  route: 'chat',
  insertsIntoAttachWhenBlocked: false,
  outgoingText: (text) => text,
  validate: () => undefined,
  ...over,
});

describe('ComposerStore submit recorder', () => {
  const recorder = (generation: number | null = 1) => {
    const recorded: [string, number][] = [];
    const live: ComposerSubmitRecorder = {
      liveGeneration: generation,
      recordSubmitted: (text, at) => recorded.push([text, at]),
    };
    return { live, recorded };
  };

  it('records what `agent.prompt` carried, against the session live at the send', async () => {
    const r = rig();
    const { live, recorded } = recorder(7);
    r.store.bindSubmitRecorder(live);
    r.store.replaceDraft('Fix the failing tests');
    await r.store.send(chatPolicy({ outgoingText: (text) => `${text}\n` }));
    expect(recorded).toEqual([['Fix the failing tests\n', 7]]);
    expect(r.calls.map((call) => call.text)).toEqual(['Fix the failing tests\n']);
  });

  it('records only after herdr accepted the text', async () => {
    const r = rig();
    const { live, recorded } = recorder();
    r.store.bindSubmitRecorder(live);
    r.failures.push(new Error('gone'));
    r.store.replaceDraft('Fix the failing tests');
    await r.store.send();
    expect(recorded).toEqual([]);
    const [message] = r.store.getSnapshot().messages;
    await r.store.retry(message?.id ?? '');
    expect(recorded).toHaveLength(1);
  });

  it('records nothing without a live session, and nothing once unbound', async () => {
    const r = rig();
    const dead = recorder(null);
    const unbind = r.store.bindSubmitRecorder(dead.live);
    r.store.replaceDraft('Fix the failing tests');
    await r.store.send();
    expect(dead.recorded).toEqual([]);
    const { live, recorded } = recorder();
    const unbindLive = r.store.bindSubmitRecorder(live);
    unbind();
    unbindLive();
    r.store.replaceDraft('Fix the failing tests again');
    await r.store.send();
    expect(recorded).toEqual([]);
  });

  it('records to the session the send started on when a surface replaces it', async () => {
    const r = rig();
    let release!: () => void;
    r.gate = new Promise((resolve) => {
      release = resolve;
    });
    const { live, recorded } = recorder(3);
    r.store.bindSubmitRecorder(live);
    r.store.replaceDraft('Fix the failing tests');
    const sending = r.store.send();
    await Promise.resolve();
    r.store.bindSubmitRecorder(recorder(4).live);
    release();
    await sending;
    expect(recorded).toEqual([['Fix the failing tests', 3]]);
  });
});
