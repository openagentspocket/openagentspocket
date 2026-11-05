import { useSheetHandover } from '@openagentspocket/ui';
import { useState } from 'react';
import { AddHostSheet } from './AddHostSheet';

/**
 * The Add Host choice as a sheet over the screen that asks for it (Home, Hosts), never a route: a
 * route that draws a native sheet over a transparent modal froze the app. A choice navigates once
 * the sheet has left. `sheet` goes anywhere in the screen's tree; `open` is the trigger.
 */
export function useAddHostSheet({
  onEasyPair,
  onAddManually,
}: {
  onEasyPair: () => void;
  onAddManually: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const handover = useSheetHandover();
  const choose = (go: () => void) => () => {
    handover.after(go);
    setVisible(false);
  };
  const sheet = (
    <AddHostSheet
      visible={visible}
      onClose={() => setVisible(false)}
      onDismissed={handover.onDismissed}
      onEasyPair={choose(onEasyPair)}
      onAddManually={choose(onAddManually)}
    />
  );
  return { open: () => setVisible(true), sheet };
}
