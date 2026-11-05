import {
  type BlockedCardState,
  type BlockedCardStore,
  type BlockedDialog,
  makeFocus,
  makeOption,
  makeSubject,
} from '@openagentspocket/core';
import type { ReactNode } from 'react';
import { BlockedCardOverride } from '@/blocked/BlockedCardSlot';

const dialog: BlockedDialog = {
  kind: 'claudeBash',
  program: 'claude',
  title: 'Bash command',
  sourceSuffix: null,
  positionLabel: null,
  body: ['Run the declined card UI test'],
  progress: null,
  options: [
    makeOption({ ordinal: 1, number: 1, label: 'Yes', role: 'approve', isFocused: true }),
    makeOption({
      ordinal: 2,
      number: 2,
      label: "Yes, and don't ask again for swift test commands in /workspace/storefront",
      role: 'approvePersistent',
    }),
    makeOption({ ordinal: 3, number: 3, label: 'No', role: 'decline' }),
  ],
  rows: { lowerBound: 0, upperBound: 10 },
  fingerprint: { value: 'atlas', requestLines: null, ruleLines: null },
  focus: makeFocus({ focusedOrdinal: 1 }),
  subject: {
    ...makeSubject(),
    commandDescription: 'Run the declined card UI test',
    command: 'swift test --filter CheckoutUITests/testDeclinedPaymentKeepsTheCart',
  },
  note: null,
};

const state: BlockedCardState = {
  content: { kind: 'card', dialog },
  progress: 'ready',
  notice: null,
  composerFocusRequest: 0,
  dialogGeneration: 0,
  isCollapsed: false,
};

const store = {
  perform: async () => undefined,
  press: async () => undefined,
  sendKeys: async () => undefined,
  setCollapsed: () => undefined,
} as unknown as BlockedCardStore;

/** A Blocked Agent's card as the atlas shows it: a Bash approval over the composer. */
export function AtlasBlocked({ children }: { children: ReactNode }) {
  return (
    <BlockedCardOverride.Provider value={{ store, state }}>{children}</BlockedCardOverride.Provider>
  );
}
