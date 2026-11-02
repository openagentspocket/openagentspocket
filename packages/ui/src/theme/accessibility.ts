import { createContext, useContext } from 'react';
import { useWindowDimensions } from 'react-native';
import { metrics } from './metrics';

export interface FontScale {
  /** The system text scale (1 at the default size). */
  scale: number;
  /**
   * True at accessibility text sizes (SwiftUI's `isAccessibilitySize`): iOS AX1 and up,
   * Android 1.5x and up. Status marks switch to shaped glyphs there, so status is never color alone.
   */
  isAccessibilitySize: boolean;
}

/**
 * Pretends a text scale for everything below it: `Text` multiplies its sizes and `useFontScale`
 * reports it. For previews that cannot change the system setting (the gallery on web). On a
 * device with a real accessibility size, leave it unset.
 */
export const FontScaleOverride = createContext<number | null>(null);

/** The scale `Text` multiplies by when a preview forces one (null otherwise). */
export function useFontScaleOverride(): number | null {
  return useContext(FontScaleOverride);
}

export function useFontScale(): FontScale {
  const { fontScale } = useWindowDimensions();
  const override = useContext(FontScaleOverride);
  const scale = override ?? fontScale;
  return { scale, isAccessibilitySize: scale > metrics.accessibilityFontScale };
}
