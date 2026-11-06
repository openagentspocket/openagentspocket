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
