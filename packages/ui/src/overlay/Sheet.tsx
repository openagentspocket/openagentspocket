import { JsSheet } from './JsSheet';
import { loadTrueSheet } from './loadTrueSheet';
import { NativeSheet } from './NativeSheet';
import { useSheetPresence } from './presence';
import type { SheetProps } from './sheetTypes';

export type { SheetBarAction } from './SheetContent';
export type { SheetDetent } from './sheetDetents';

/**
 * The one sheet. On iOS and Android it is the native sheet (UISheetPresentationController /
 * BottomSheetBehavior through True Sheet), with the same surface and radius as a route sheet. Where
 * that module does not exist (web, the gallery, Jest) the JS host draws the same content.
 * Callers never choose: the props are the same. While shown it counts in `useOverlayShowing`.
 */
export function Sheet(props: SheetProps) {
  const onDismissed = useSheetPresence(props.visible, props.onDismissed);
  return loadTrueSheet() ? (
    <NativeSheet {...props} onDismissed={onDismissed} />
  ) : (
    <JsSheet {...props} onDismissed={onDismissed} />
  );
}
