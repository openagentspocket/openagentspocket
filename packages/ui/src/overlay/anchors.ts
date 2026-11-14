import { useCallback, useEffect } from 'react';
import {
  type Measurable,
  measureWindowFrame,
  useScreenRoot,
  type WindowFrame,
} from './windowFrame';

/** A control's frame in window coordinates. */
export type AnchorRect = WindowFrame;

const anchors = new Map<string, { node: Measurable; root: ReturnType<typeof useScreenRoot> }>();

/**
 * Registers a control as the anchor of a popover (`confirm({ anchorKey })`). Spread the returned
 * `ref` on the control's View or Tappable; the popover measures it when it opens.
 */
export function useAnchor(key: string | undefined) {
  const root = useScreenRoot();
  const ref = useCallback(
    (node: Measurable | null) => {
      if (!key) return;
      if (node) anchors.set(key, { node, root });
      else anchors.delete(key);
    },
    [key, root],
  );
  useEffect(() => () => void (key && anchors.delete(key)), [key]);
  return ref;
}

/** The anchor's current frame, or null when no control registered under the key is mounted. */
export function measureAnchor(key: string): Promise<AnchorRect | null> {
  const anchor = anchors.get(key);
  return measureWindowFrame(anchor?.node, anchor?.root?.current);
}
