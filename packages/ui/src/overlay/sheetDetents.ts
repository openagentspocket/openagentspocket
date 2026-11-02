import { useMemo, useRef, useState } from 'react';
import { PanResponder, type ViewProps } from 'react-native';

/** medium: half the screen; large: nearly all of it; fit: as tall as its content. */
export type SheetDetent = 'medium' | 'large' | 'fit';
export type ResizableDetent = 'medium' | 'large';

export const DETENT_SHARE: Record<SheetDetent, number> = { medium: 0.5, large: 0.92, fit: 0.92 };

/** A drag shorter than this (px) snaps back. */
export const DRAG_THRESHOLD = 60;
/** A flick faster than this (px/ms) counts even when short. */
export const FLICK_VELOCITY = 0.8;

export type DragOutcome = ResizableDetent | 'close';

/**
 * Where a vertical drag ends. `dy` is positive downward. Up from medium grows to large; down from
 * large shrinks to medium; down from medium (or from a fit sheet) closes. Anything short stays put.
 */
export function settleDetent(from: SheetDetent, dy: number, velocity: number): DragOutcome {
  const stay: DragOutcome = from === 'large' ? 'large' : 'medium';
  const far = Math.abs(dy) >= DRAG_THRESHOLD || Math.abs(velocity) >= FLICK_VELOCITY;
  if (!far || dy === 0) return stay;
  if (dy < 0) return from === 'fit' ? stay : 'large';
  return from === 'large' ? 'medium' : 'close';
}

/** The panel's live detent, its height offset (px, positive = taller) and the grabber's handlers. */
export function useSheetDrag(
  initial: SheetDetent,
  onClose: () => void,
): { detent: SheetDetent; offset: number; handlers: ViewProps } {
  const [current, setCurrent] = useState<SheetDetent>(initial);
  const [offset, setOffset] = useState(0);
  const latest = useRef({ current, onClose });
  latest.current = { current, onClose };
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
        onPanResponderMove: (_e, g) => setOffset(-g.dy),
        onPanResponderRelease: (_e, g) => {
          setOffset(0);
          const outcome = settleDetent(latest.current.current, g.dy, g.vy);
          if (outcome === 'close') latest.current.onClose();
          else if (latest.current.current !== 'fit') setCurrent(outcome);
        },
        onPanResponderTerminate: () => setOffset(0),
      }),
    [],
  );
  return { detent: current, offset, handlers: responder.panHandlers };
}
