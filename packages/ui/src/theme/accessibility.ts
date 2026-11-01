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

export function useFontScale(): FontScale {
  const { fontScale } = useWindowDimensions();
  return { scale: fontScale, isAccessibilitySize: fontScale > metrics.accessibilityFontScale };
}
