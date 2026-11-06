import { useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { MENU_WIDTH, type MenuAnchor } from './ActionMenu';

/** Keeps the menu clear of the finger that opened it. */
const FINGER_GAP = 8;

/** Where a touch happened, as a menu anchor centered on it; undefined for a press with no point. */
export function touchAnchor(event?: GestureResponderEvent): MenuAnchor | undefined {
  const touch = event?.nativeEvent;
  if (touch?.pageX === undefined || touch.pageY === undefined) return undefined;
  return {
    x: touch.pageX - MENU_WIDTH / 2,
    y: touch.pageY,
    width: MENU_WIDTH,
    height: FINGER_GAP,
  };
}

/** A menu that opens where the user pressed: pass `open` to a press, spread `menuProps` on the ActionMenu. */
export function useContextMenu() {
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState<MenuAnchor | undefined>();
  return {
    open: (event?: GestureResponderEvent) => {
      setAnchor(touchAnchor(event));
      setVisible(true);
    },
    menuProps: { visible, anchor, onClose: () => setVisible(false) },
  };
}
