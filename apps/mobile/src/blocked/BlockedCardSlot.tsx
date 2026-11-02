import type { ConsoleRow } from '@openagentspocket/core';
import { BlockedCard } from './BlockedCard';
import { useBlockedCard } from './useBlockedCard';

/** The Blocked card of one Agent, wired to its store; renders nothing while nothing is asked. */
export function BlockedCardSlot({ row }: { row: ConsoleRow }) {
  const card = useBlockedCard(row);
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
