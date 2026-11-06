import { act, renderHook } from '@testing-library/react-native';
import { useRowMenu } from './useRowMenu';

const action = (key: string, onPress = jest.fn()) => ({ key, title: key, onPress });

describe('useRowMenu', () => {
  it('opens on long press only with a menu', async () => {
    const { result } = await renderHook(() => useRowMenu([action('pin')]));
    await act(async () => result.current.onLongPress?.());
    expect(result.current.menuProps.visible).toBe(true);
    await act(async () => result.current.menuProps.onClose());
    expect(result.current.menuProps.visible).toBe(false);
    const empty = await renderHook(() => useRowMenu([]));
    expect(empty.result.current.onLongPress).toBeUndefined();
  });

  it('offers each action once to a screen reader, and runs it by name', async () => {
    const press = jest.fn();
    const { result } = await renderHook(() =>
      useRowMenu([action('pin')], [action('pin', press), action('close')]),
    );
    const names = result.current.a11y.accessibilityActions.map((a) => a.name);
    expect(names).toEqual(['pin', 'close']);
    result.current.a11y.onAccessibilityAction({ nativeEvent: { actionName: 'pin' } } as never);
    expect(press).toHaveBeenCalledTimes(1);
  });
});
