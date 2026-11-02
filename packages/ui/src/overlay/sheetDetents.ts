import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, type ViewProps } from 'react-native';

/**
 * medium: half the screen; large: nearly all of it; fit: as tall as its content;
 * `{ fraction }`: that share of the screen (SwiftUI `.fraction(0.65)`).
 */
export type FractionDetent = { fraction: number };
export type SheetDetent = 'medium' | 'large' | 'fit' | FractionDetent;
export type ResizableDetent = 'medium' | 'large' | FractionDetent;

export const DETENT_SHARE = { medium: 0.5, large: 0.92, fit: 0.92 } as const;

/** The share of the window height a detent asks for (a fraction is kept below `large`). */
export function detentShare(detent: SheetDetent): number {
  if (typeof detent === 'object') {
    return Math.min(DETENT_SHARE.large, Math.max(0.2, detent.fraction));
  }
  return DETENT_SHARE[detent];
}

/** A drag shorter than this (px) snaps back. */
export const DRAG_THRESHOLD = 60;
/** A flick faster than this (px/ms) counts even when short. */
export const FLICK_VELOCITY = 0.8;

export type DragOutcome = ResizableDetent | 'close';

/**
 * Where a vertical drag ends. `dy` is positive downward. Up from medium grows to large; down from
 * large shrinks to medium; down from medium (or from a fit sheet) closes. Anything short stays put.
 */
export function settleDetent(
  from: SheetDetent,
  dy: number,
  velocity: number,
  /** The detent the sheet opened at: where a drag down from large returns to. */
  base: SheetDetent = 'medium',
): DragOutcome {
  const stay: DragOutcome = from === 'large' ? 'large' : from === 'fit' ? 'medium' : from;
  const far = Math.abs(dy) >= DRAG_THRESHOLD || Math.abs(velocity) >= FLICK_VELOCITY;
  if (!far || dy === 0) return stay;
  if (dy < 0) return from === 'fit' ? stay : 'large';
  if (from !== 'large') return 'close';
  return base === 'large' || base === 'fit' ? 'medium' : base;
}

/** A stable key so an inline `{ fraction }` object does not reset the sheet on every render. */
const detentKey = (detent: SheetDetent): string =>
  typeof detent === 'object' ? `f${detent.fraction}` : detent;

/** The panel's live detent, its height offset (px, positive = taller) and the grabber's handlers. */
export function useSheetDrag(
  initial: SheetDetent,
  onClose: () => void,
  visible = true,
): { detent: SheetDetent; offset: number; handlers: ViewProps } {
  const [current, setCurrent] = useState<SheetDetent>(initial);
  const [offset, setOffset] = useState(0);
  const latest = useRef({ current, onClose, initial });
  latest.current = { current, onClose, initial };
  // A Sheet stays mounted while hidden: every reopen (or changed `detent` prop) starts from `initial`.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by value so an inline { fraction } does not reset the sheet on every render
  useEffect(() => {
    if (!visible) return;
    setCurrent(initial);
    setOffset(0);
  }, [visible, detentKey(initial)]);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
        onPanResponderMove: (_e, g) => setOffset(-g.dy),
        onPanResponderRelease: (_e, g) => {
          setOffset(0);
          const outcome = settleDetent(latest.current.current, g.dy, g.vy, latest.current.initial);
          if (outcome === 'close') latest.current.onClose();
          else if (latest.current.current !== 'fit') setCurrent(outcome);
        },
        onPanResponderTerminate: () => setOffset(0),
      }),
    [],
  );
  return { detent: current, offset, handlers: responder.panHandlers };
}
