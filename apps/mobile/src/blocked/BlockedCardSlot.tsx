import type { ConsoleRow } from '@openagentspocket/core';
import { createContext, useContext } from 'react';
import { BlockedCard } from './BlockedCard';
import { type BlockedCardHandle, useBlockedCard } from './useBlockedCard';

/** Previews and the atlas hand the slot a scripted card instead of one read from a pane. */
export const BlockedCardOverride = createContext<BlockedCardHandle | null>(null);

/** The Blocked card of one Agent, wired to its store; renders nothing while nothing is asked. */
export function BlockedCardSlot({ row }: { row: ConsoleRow }) {
  const live = useBlockedCard(row);
  const card = useContext(BlockedCardOverride) ?? live;
  if (!card) return null;
  const { store, state } = card;
  return (
    <BlockedCard
      state={state}
      onChoose={(ordinal) => void store.perform({ kind: 'choose', ordinal })}
      onStop={() => void store.perform({ kind: 'dismiss' })}
      onPress={(number) => void store.press(number)}
      onKeys={(keys) => void store.sendKeys(keys)}
      onCollapsedChange={(collapsed) => store.setCollapsed(collapsed)}
    />
  );
}
