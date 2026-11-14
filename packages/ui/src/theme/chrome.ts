import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { useInsets } from './insets';
import { airy, metrics, spacing } from './metrics';

/** Where a screen's own top and bottom bars sit, measured from the window's edges. */
export interface ChromeInsets {
  /** From the window's top to a top bar's first control: the safe top and a hairline of air. */
  top: number;
  /**
   * From the window's bottom (or the keyboard's top) to a bottom bar's lower edge. A bar adds it
   * below itself; the screen under it runs to the window's bottom.
   */
  bottom: number;
}

/** Between a top bar and the safe-area top. */
export const CHROME_TOP_GAP = airy.line;
/** Between a bottom bar and the keyboard while it is up. */
export const CHROME_KEYBOARD_GAP = spacing.xxs;
/** A bottom bar's margin where nothing of the system sits under it. */
export const CHROME_MIN_BOTTOM = spacing.xs;

/**
 * The one rule for screen chrome. On iOS a bottom bar reaches into the home indicator's strip as the
 * system's own bars do (34 pt strip: 20 pt from the bottom); elsewhere a bottom inset is a system bar
 * (Android's navigation) the bar stays above. With no inset it keeps a small margin, and over the
 * keyboard only the small gap.
 */
export function chromeInsets(
  safe: Pick<EdgeInsets, 'top' | 'bottom'>,
  platform: string,
  keyboardUp = false,
): ChromeInsets {
  const top = safe.top + CHROME_TOP_GAP;
  if (keyboardUp) return { top, bottom: CHROME_KEYBOARD_GAP };
  const reach = platform === 'ios' ? safe.bottom - metrics.homeIndicatorOverlap : safe.bottom;
  return { top, bottom: Math.max(reach, CHROME_MIN_BOTTOM) };
}

/**
 * Whether the on-screen keyboard is up. iOS says so as it starts to move, so a bar's margin changes
 * with the lift; Android only once it is up.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(() => Keyboard.isVisible?.() ?? false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const shown = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setVisible(true),
    );
    const hidden = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setVisible(false),
    );
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return visible;
}

/**
 * `chromeInsets` for this device. Every top and bottom bar reads it; a bar the keyboard lifts (inside
 * a keyboard-avoiding screen) passes `aboveKeyboard` so it keeps only the small gap while it is up.
 */
export function useChromeInsets({ aboveKeyboard = false } = {}): ChromeInsets {
  const keyboardUp = useKeyboardVisible();
  return chromeInsets(useInsets(), Platform.OS, aboveKeyboard && keyboardUp);
}
