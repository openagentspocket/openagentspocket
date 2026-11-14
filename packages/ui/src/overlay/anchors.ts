import { useCallback, useEffect } from 'react';

/** What a ref to a View or Tappable gives: only measuring is used. */
interface Measurable {
  measureInWindow(callback: (x: number, y: number, width: number, height: number) => void): void;
}

/** A control's frame in window coordinates. */
export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const anchors = new Map<string, Measurable>();

/**
 * Registers a control as the anchor of a popover (`confirm({ anchorKey })`). Spread the returned
 * `ref` on the control's View or Tappable; the popover measures it when it opens.
 */
export function useAnchor(key: string | undefined) {
  const ref = useCallback(
    (node: Measurable | null) => {
      if (!key) return;
      if (node) anchors.set(key, node);
      else anchors.delete(key);
    },
    [key],
  );
  useEffect(() => () => void (key && anchors.delete(key)), [key]);
  return ref;
}

/** The anchor's current frame, or null when no control registered under the key is mounted. */
export function measureAnchor(key: string): Promise<AnchorRect | null> {
  const node = anchors.get(key);
  if (!node || typeof node.measureInWindow !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    // A host without native measuring (tests, some web builds) never calls back: fall back.
    const timer = setTimeout(() => resolve(null), 120);
    node.measureInWindow((x, y, width, height) => {
      clearTimeout(timer);
      resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
    });
  });
}

/** Where the finger went down, in window coordinates (a touch event's pageX and pageY). */
export interface PressPoint {
  pageX: number;
  pageY: number;
}

/** How far outside a control's frame a press still counts as on it (its hit slop). */
const PRESS_SLOP = 12;

/**
 * A control's frame in window coordinates from what `measureInWindow` said and where the press
 * landed. Some native parents (a glass capsule, a bar inside a scroll view) make the measured
 * origin relative to the parent; a press on the control cannot lie outside its own frame, so a
 * frame that does not hold the press is replaced by one of the same size centered on the press.
 * An empty frame (a view that has not laid out, web before layout) is no anchor at all.
 */
export function reconcileFrame(
  measured: AnchorRect | null,
  press?: PressPoint | null,
): AnchorRect | null {
  if (!measured || measured.width <= 0 || measured.height <= 0) return null;
  if (!press) return measured;
  const { x, y, width, height } = measured;
  const inside =
    press.pageX >= x - PRESS_SLOP &&
    press.pageX <= x + width + PRESS_SLOP &&
    press.pageY >= y - PRESS_SLOP &&
    press.pageY <= y + height + PRESS_SLOP;
  if (inside) return measured;
  return { x: press.pageX - width / 2, y: press.pageY - height / 2, width, height };
}
