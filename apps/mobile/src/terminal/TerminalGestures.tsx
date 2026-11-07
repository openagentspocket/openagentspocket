import {
  pointsPerRow,
  TERMINAL_FONT_SIZE_RANGE,
  type TerminalTouchScroll,
} from '@openagentspocket/core';
import { type ReactNode, useRef, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import {
  GestureDetector,
  useCompetingGestures,
  useNativeGesture,
  usePanGesture,
  usePinchGesture,
} from 'react-native-gesture-handler';
import { useSetting } from '@/settings/SettingsProvider';

const clamp = (size: number) =>
  Math.min(TERMINAL_FONT_SIZE_RANGE.max, Math.max(TERMINAL_FONT_SIZE_RANGE.min, Math.round(size)));

/** The renderer's long press allows this much wander, so a press never starts a drag. */
const DRAG_START_POINTS = 10;
const SIDEWAYS_FAIL_POINTS = 20;

/**
 * What a finger does to a terminal from outside its native view.
 *
 * Pinch: the text size is one app-wide setting (Swift TerminalZoomSettings), so the Settings
 * stepper and a pinch on any terminal change the same value, and it sticks. While the fingers are
 * down the size follows them; lifting saves it.
 *
 * Drag: scrolls a remote that tracks the mouse, through `touchScroll`. The pan runs only then; the
 * renderer's own pan keeps every other case (local scrollback, cursor keys on the alternate screen).
 * The native gesture stands for the renderer's recognizers on iOS: gesture handler sees them as it,
 * so the pan runs alongside them instead of racing them, and the renderer's taps, long press and
 * keyboard handling go on untouched. On Android the view takes plain touches and needs none of it.
 */
export function TerminalGestures({
  touchScroll,
  children,
}: {
  touchScroll: TerminalTouchScroll;
  children: (fontSize: number) => ReactNode;
}) {
  const [saved, save] = useSetting('terminalFontSize');
  const [live, setLive] = useState<number | null>(null);
  const start = useRef(saved);
  const fontSize = live ?? saved;
  const remoteScroll = useSyncExternalStore(touchScroll.subscribe, touchScroll.isActive);

  const pinch = usePinchGesture({
    runOnJS: true,
    onActivate: () => {
      start.current = saved;
    },
    onUpdate: (event) => setLive(clamp(start.current * event.scale)),
    onDeactivate: (event) => {
      save(clamp(start.current * event.scale));
      setLive(null);
    },
  });
  const renderer = useNativeGesture({ enabled: Platform.OS === 'ios' });
  const drag = usePanGesture({
    runOnJS: true,
    enabled: remoteScroll,
    maxPointers: 1,
    activeOffsetY: [-DRAG_START_POINTS, DRAG_START_POINTS],
    failOffsetX: [-SIDEWAYS_FAIL_POINTS, SIDEWAYS_FAIL_POINTS],
    simultaneousWith: renderer,
    onBegin: () => touchScroll.halt(),
    onUpdate: (event) => touchScroll.drag(event.changeY, pointsPerRow(fontSize)),
    onDeactivate: (event) => {
      if (event.canceled) touchScroll.halt();
      else touchScroll.release(event.velocityY, pointsPerRow(fontSize));
    },
  });
  const gesture = useCompetingGestures(pinch, drag, renderer);
  return <GestureDetector gesture={gesture}>{children(fontSize)}</GestureDetector>;
}
