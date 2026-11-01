import { createContext, useContext } from 'react';
import type { ColorKey } from '../theme/tokens.generated';

const SurfaceFillContext = createContext<ColorKey>('canvas');

/**
 * Declares the fill painted under its children: Card provides its level's fill, Sheet its
 * panel's; outside both it is the canvas (Screen, VirtualList).
 */
export const SurfaceFillProvider = SurfaceFillContext.Provider;

/**
 * The fill under the current content. Rows are transparent; what must be opaque (a SwipeRow's
 * front over its actions) or cut out (ProgramMark's ring around the status dot) paints this.
 */
export function useSurfaceFill(): ColorKey {
  return useContext(SurfaceFillContext);
}
