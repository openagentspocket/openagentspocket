import { FakeClock } from '../hosts/cancellation';
import type { ComposerDeliveryPolicy } from './policy';
import { ComposerStore } from './store';

export interface Rig {
  store: ComposerStore;
  clock: FakeClock;
  calls: { target: string; text: string }[];
  failures: unknown[];
  gate?: Promise<void>;
}

export function rig(status = 'idle', extra: { budget?: number } = {}): Rig {
  const clock = new FakeClock();
  const state: Rig = { store: undefined as never, clock, calls: [], failures: [] };
  state.store = new ComposerStore({
    target: 'w1:p1',
    clock,
    initialStatus: status,
    notReadyRetryMs: 5,
    ...(extra.budget === undefined ? {} : { notReadyBudgetMs: extra.budget }),
    prompt: async (params) => {
      state.calls.push(params);
      if (state.gate) await state.gate;
      const failure = state.failures.shift();
      if (failure) throw failure;
    },
  });
  return state;
}

export const chatPolicy = (over: Partial<ComposerDeliveryPolicy> = {}): ComposerDeliveryPolicy => ({
  route: 'chat',
  insertsIntoAttachWhenBlocked: false,
  outgoingText: (text) => text,
  validate: () => undefined,
  ...over,
});

export const states = (store: ComposerStore) => store.getSnapshot().messages.map((m) => m.state);
