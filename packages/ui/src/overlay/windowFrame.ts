import { createContext, type RefObject, useContext, useEffect, useRef } from 'react';
import { Dimensions, Keyboard, Platform } from 'react-native';

/** What a ref to a View or Tappable gives: only measuring is used. */
export interface Measurable {
  measureInWindow(callback: (x: number, y: number, width: number, height: number) => void): void;
}

/** A frame in window coordinates. */
export interface WindowFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A host without native measuring (tests, some web builds) never calls back: give up after this. */
const MEASURE_TIMEOUT_MS = 120;

/**
 * How far below the window's top a screen really starts, beyond what `measureInWindow` sees.
 * On iOS, UIKit lays a stack screen out below the status area (72 pt on a 402x874 iPhone), but
 * react-native-screens tells the shadow tree its origin is 0 when the header is translucent (every
 * stack here): every frame measured on that screen reads that much too high, while its size is
 * right. A stack screen and a sheet end at the window's bottom, so the missing origin is the
 * window's height less where the screen's root says it ends.
 */
export function hiddenScreenOrigin(windowHeight: number, root: WindowFrame | null): number {
  if (!root || root.height <= 0) return 0;
  return Math.max(0, windowHeight - (root.y + root.height));
}

/** A frame measured on a screen, moved down by the origin the measurement missed. */
export function correctFrame(frame: WindowFrame, origin: number): WindowFrame {
  return origin > 0 ? { ...frame, y: frame.y + origin } : frame;
}

/** The root view of the screen a control is drawn on (set by `Screen`). */
export const ScreenRootContext = createContext<RefObject<Measurable | null> | null>(null);

/** The current screen's root, for `measureWindowFrame`; null outside a `Screen`. */
export function useScreenRoot(): RefObject<Measurable | null> | null {
  return useContext(ScreenRootContext);
}

function measure(node: Measurable | null | undefined): Promise<WindowFrame | null> {
  if (!node || typeof node.measureInWindow !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), MEASURE_TIMEOUT_MS);
    node.measureInWindow((x, y, width, height) => {
      clearTimeout(timer);
      resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
    });
  });
}

/**
 * A control's real frame in the window: `measureInWindow`, corrected on iOS by the screen origin
 * it misses (see `hiddenScreenOrigin`). Null when it cannot be measured (tests, a detached view).
 */
export async function measureWindowFrame(
  node: Measurable | null | undefined,
  root?: Measurable | null,
): Promise<WindowFrame | null> {
  const [frame, rootFrame] = await Promise.all([
    measure(node),
    Platform.OS === 'ios' && root ? measure(root) : Promise.resolve(null),
  ]);
  if (!frame) return null;
  return correctFrame(frame, hiddenScreenOrigin(Dimensions.get('window').height, rootFrame));
}

/**
 * While a popover is open, measures its anchor again each time the keyboard finishes showing or
 * hiding: a frame measured before the keyboard moved the screen (the Composer's buttons ride on it,
 * and opening a menu takes the keyboard down) no longer says where the anchor is.
 */
export function useRemeasureOnKeyboard(open: boolean, remeasure: () => void): void {
  const latest = useRef(remeasure);
  latest.current = remeasure;
  useEffect(() => {
    if (!open) return;
    const run = () => latest.current();
    const subscriptions = [
      Keyboard.addListener('keyboardDidHide', run),
      Keyboard.addListener('keyboardDidShow', run),
    ];
    return () => {
      for (const subscription of subscriptions) subscription.remove();
    };
  }, [open]);
}
