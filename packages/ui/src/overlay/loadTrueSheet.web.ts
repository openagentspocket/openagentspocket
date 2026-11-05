import type { ComponentType } from 'react';
import type { TrueSheetViewProps } from './loadTrueSheet';

/** The web has no native sheet: `Sheet` draws its JS host, and the package is never bundled. */
export function loadTrueSheet(): ComponentType<TrueSheetViewProps> | null {
  return null;
}
