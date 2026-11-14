import { type RefObject, useRef } from 'react';
import type { GestureResponderEvent, ViewInstance } from 'react-native';
import { type AnchorRect, type PressPoint, reconcileFrame } from './anchors';

const MEASURE_TIMEOUT_MS = 80;
/** A touch this recent opened the menu: its position backs up the measured frame. */
const RECENT_TOUCH_MS = 1500;

/**
 * Measures a menu trigger in window coordinates at the moment it is pressed. Spread `ref` and
 * `onTouchStart` on the trigger's wrapper View; `measure` calls back once with the frame, or with
 * undefined when it cannot be measured (tests, a detached view, web before layout), so the menu
 * still opens.
 */
export function useMenuTrigger(): {
  ref: RefObject<ViewInstance | null>;
  onTouchStart: (event: GestureResponderEvent) => void;
  measure: (done: (anchor: AnchorRect | undefined) => void) => void;
} {
  const ref = useRef<ViewInstance>(null);
  const touch = useRef<{ point: PressPoint; at: number } | null>(null);
  const onTouchStart = (event: GestureResponderEvent) => {
    const { pageX, pageY } = event.nativeEvent;
    touch.current = { point: { pageX, pageY }, at: Date.now() };
  };
  const measure = (done: (anchor: AnchorRect | undefined) => void) => {
    // The finger that opened the menu, if it went down a moment ago (not a screen reader's press).
    const recent = touch.current && Date.now() - touch.current.at < RECENT_TOUCH_MS;
    const press = recent ? touch.current?.point : undefined;
    let called = false;
    const once = (anchor: AnchorRect | undefined) => {
      if (called) return;
      called = true;
      done(anchor);
    };
    ref.current?.measureInWindow?.((x, y, width, height) =>
      once(reconcileFrame({ x, y, width, height }, press) ?? undefined),
    );
    setTimeout(() => once(undefined), MEASURE_TIMEOUT_MS);
  };
  return { ref, onTouchStart, measure };
}
