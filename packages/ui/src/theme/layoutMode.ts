import { useWindowDimensions } from 'react-native';

/** One column on a phone; two side by side; two wide ones; those two and a sidebar. */
export type LayoutMode = 'compact' | 'regular' | 'wide' | 'expansive';

const REGULAR_WIDTH = 600;
const WIDE_WIDTH = 860;
const EXPANSIVE_WIDTH = 1160;

export function layoutModeFor(width: number): LayoutMode {
  if (width >= EXPANSIVE_WIDTH) return 'expansive';
  if (width >= WIDE_WIDTH) return 'wide';
  return width >= REGULAR_WIDTH ? 'regular' : 'compact';
}

/** The one place a screen learns how much room it has: never a width check of its own. */
export function useLayoutMode(): LayoutMode {
  return layoutModeFor(useWindowDimensions().width);
}
