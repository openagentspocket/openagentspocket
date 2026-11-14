import { act, renderHook } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import { type PopoverRoom, placePopover } from './menuPlacement';
import { correctFrame, hiddenScreenOrigin, useRemeasureOnKeyboard } from './windowFrame';

// An iPhone 17 Pro: a 402x874 pt window, 62 pt safe top, 34 pt safe bottom.
const room: PopoverRoom = {
  windowWidth: 402,
  windowHeight: 874,
  insetTop: 62,
  insetBottom: 34,
  margin: 4,
  unanchoredBottom: 58,
};

describe('hiddenScreenOrigin', () => {
  it('is what the screen root misses of the window bottom (Home: drawn at 72, measured at 0)', () => {
    expect(hiddenScreenOrigin(874, { x: 0, y: 0, width: 402, height: 802 })).toBe(72);
    expect(
      correctFrame({ x: 31, y: 2, width: 137, height: 44 }, hiddenScreenOrigin(874, null)),
    ).toEqual({ x: 31, y: 2, width: 137, height: 44 });
  });

  it('is 0 for a root measured where it is drawn, or one that runs past the bottom', () => {
    expect(hiddenScreenOrigin(874, { x: 0, y: 0, width: 402, height: 874 })).toBe(0);
    expect(hiddenScreenOrigin(874, { x: 0, y: 0, width: 402, height: 900 })).toBe(0);
    expect(hiddenScreenOrigin(874, { x: 0, y: 0, width: 0, height: 0 })).toBe(0);
  });

  it('moves the measured frame down by it', () => {
    expect(correctFrame({ x: 31, y: 2, width: 137, height: 44 }, 72)).toEqual({
      x: 31,
      y: 74,
      width: 137,
      height: 44,
    });
  });
});

describe('placePopover', () => {
  const pill = { x: 31, y: 74, width: 137, height: 44 };

  it('opens a leading pill menu under the pill, leading-aligned, never over it', () => {
    const at = placePopover(pill, 250, 108, room);
    expect(at.left).toBe(31);
    expect(at.top).toBeGreaterThanOrEqual(pill.y + pill.height);
  });

  it('trailing-aligns a menu whose anchor is on the trailing side', () => {
    const more = { x: 342, y: 82, width: 44, height: 44 };
    const at = placePopover(more, 250, 300, room);
    expect(at.left).toBe(342 + 44 - 250);
    expect(at.top).toBeGreaterThanOrEqual(more.y + more.height);
  });

  it('keeps the panel inside the margins', () => {
    const wide = placePopover({ x: 0, y: 74, width: 40, height: 44 }, 250, 108, room);
    expect(wide.left).toBe(4);
    const edge = placePopover({ x: 380, y: 74, width: 40, height: 44 }, 250, 108, room);
    expect(edge.left).toBe(402 - 250 - 4);
  });

  it('opens above an anchor near the bottom, ending over it', () => {
    const composer = { x: 125, y: 790, width: 44, height: 44 };
    const at = placePopover(composer, 250, 300, room);
    expect(at.top).toBeUndefined();
    expect(874 - (at.bottom ?? 0)).toBeLessThanOrEqual(composer.y);
    expect(at.maxHeight).toBeGreaterThanOrEqual(300);
  });

  it('a menu that fits on neither side gets the whole height, every item reachable', () => {
    const at = placePopover({ x: 125, y: 481, width: 44, height: 44 }, 250, 520, room);
    expect(at.top).toBe(874 - 34 - 4 - 520);
    expect(at.maxHeight).toBe(874 - 34 - 4 - (62 + 4));
  });

  it('without an anchor it sits centered near the bottom', () => {
    const at = placePopover(undefined, 250, 108, room);
    expect(at.left).toBe((402 - 250) / 2);
    expect(at.bottom).toBe(58);
  });
});

describe('useRemeasureOnKeyboard', () => {
  it('measures again when the keyboard hides or shows while open, and not once closed', async () => {
    const listeners: Record<string, () => void> = {};
    const spy = jest.spyOn(Keyboard, 'addListener').mockImplementation(((
      event: string,
      run: () => void,
    ) => {
      listeners[event] = run;
      return { remove: () => delete listeners[event] };
    }) as never);
    const remeasure = jest.fn();
    const { rerender } = await renderHook(
      ({ open }: { open: boolean }) => useRemeasureOnKeyboard(open, remeasure),
      {
        initialProps: { open: true },
      },
    );
    await act(() => listeners.keyboardDidHide?.());
    await act(() => listeners.keyboardDidShow?.());
    expect(remeasure).toHaveBeenCalledTimes(2);
    await rerender({ open: false });
    expect(listeners.keyboardDidHide).toBeUndefined();
    spy.mockRestore();
  });
});
