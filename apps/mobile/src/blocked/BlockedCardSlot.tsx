import { createContext, useContext } from 'react';
import { BlockedCard } from './BlockedCard';
import { useAgentWait } from './BlockedCardProvider';
import type { BlockedCardHandle } from './useBlockedCard';

/** Previews and the atlas hand the slot a scripted card instead of one read from a pane. */
export const BlockedCardOverride = createContext<BlockedCardHandle | null>(null);

/** The Blocked card of one Agent, wired to its store; renders nothing while nothing is asked. */
export function BlockedCardSlot() {
  const { card: live, showTerminal } = useAgentWait();
  const card = useContext(BlockedCardOverride) ?? live;
  if (!card) return null;
  const { store, state } = card;
  return (
    <BlockedCard
      state={state}
      onChoose={(ordinal) => void store.perform({ kind: 'choose', ordinal })}
      onSubmitSelection={(ordinals) => void store.perform({ kind: 'submitSelection', ordinals })}
      onStop={() => void store.perform({ kind: 'dismiss' })}
      onPress={(number) => void store.press(number)}
      onKeys={(keys) => void store.sendKeys(keys)}
      onCollapsedChange={(collapsed) => store.setCollapsed(collapsed)}
      onShowTerminal={showTerminal}
    />
  );
}
