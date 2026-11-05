import { JsSheet } from './JsSheet';
import { loadTrueSheet } from './loadTrueSheet';
import { NativeSheet } from './NativeSheet';
import type { SheetProps } from './sheetTypes';

export type { SheetBarAction } from './SheetContent';
export type { SheetDetent } from './sheetDetents';

/**
 * The one sheet. On iOS and Android it is the native sheet (UISheetPresentationController /
 * BottomSheetBehavior through True Sheet), with the same surface and radius as a route sheet. Where
 * that module does not exist (web, the gallery, Jest) the JS host draws the same content.
 * Callers never choose: the props are the same.
 */
export function Sheet(props: SheetProps) {
  return loadTrueSheet() ? <NativeSheet {...props} /> : <JsSheet {...props} />;
}
