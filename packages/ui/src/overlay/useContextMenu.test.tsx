import { act, renderHook } from '@testing-library/react-native';
import type { GestureResponderEvent } from 'react-native';
import { MENU_WIDTH } from './ActionMenu';
import { touchAnchor, useContextMenu } from './useContextMenu';

const press = (pageX: number, pageY: number) =>
  ({ nativeEvent: { pageX, pageY } }) as GestureResponderEvent;

describe('useContextMenu', () => {
  it('centers the anchor on the touch', () => {
    const anchor = touchAnchor(press(200, 300));
    expect(anchor?.x).toBe(200 - MENU_WIDTH / 2);
    expect(anchor?.y).toBe(300);
  });

  it('has no anchor for a press with no point', () => {
    expect(touchAnchor()).toBeUndefined();
  });

  it('opens at the press and keeps the anchor while it closes', async () => {
    const { result } = await renderHook(() => useContextMenu());
    await act(async () => result.current.open(press(100, 120)));
    expect(result.current.menuProps.visible).toBe(true);
    await act(async () => result.current.menuProps.onClose());
    expect(result.current.menuProps.visible).toBe(false);
    expect(result.current.menuProps.anchor?.y).toBe(120);
  });
});
