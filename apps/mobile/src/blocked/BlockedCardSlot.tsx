import { createContext, useContext, useEffect } from 'react';
import { Keyboard } from 'react-native';
import { BlockedCard } from './BlockedCard';
import { useAgentWait } from './BlockedCardProvider';
import type { BlockedCardHandle } from './useBlockedCard';

/** Previews and the atlas hand the slot a scripted card instead of one read from a pane. */
export const BlockedCardOverride = createContext<BlockedCardHandle | null>(null);

/** The Blocked card of one Agent, wired to its store; renders nothing while nothing is asked. */
export function BlockedCardSlot() {
  const { card: live, showTerminal } = useAgentWait();
  const card = useContext(BlockedCardOverride) ?? live;
  const kind = card?.state.content.kind;
  const asks = kind !== undefined && kind !== 'none' && kind !== 'questionUnread';
  const generation = card?.state.dialogGeneration;
  // The keyboard would cover the answers, and the composer has nothing to say until they go.
  // biome-ignore lint/correctness/useExhaustiveDependencies: each new dialog closes it once
  useEffect(() => {
    if (asks) Keyboard.dismiss();
  }, [asks, generation]);
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
