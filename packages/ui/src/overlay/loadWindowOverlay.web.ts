import type { ComponentType } from 'react';
import type { WindowOverlayProps } from './loadWindowOverlay';

/** The web draws alerts in a `Modal` (a portal over the page): the package is never bundled. */
export function loadWindowOverlay(): ComponentType<WindowOverlayProps> | null {
  return null;
}
