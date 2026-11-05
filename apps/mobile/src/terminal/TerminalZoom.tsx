import { TERMINAL_FONT_SIZE_RANGE } from '@openagentspocket/core';
import { type ReactNode, useRef, useState } from 'react';
import { GestureDetector, usePinchGesture } from 'react-native-gesture-handler';
import { useSetting } from '@/settings/SettingsProvider';

const clamp = (size: number) =>
  Math.min(TERMINAL_FONT_SIZE_RANGE.max, Math.max(TERMINAL_FONT_SIZE_RANGE.min, Math.round(size)));

/**
 * The terminal's text size is one app-wide setting (Swift TerminalZoomSettings): the Settings
 * stepper and a pinch on any terminal change the same value, and it sticks. While the fingers are
 * down the size follows them; lifting saves it.
 */
export function TerminalZoom({ children }: { children: (fontSize: number) => ReactNode }) {
  const [saved, save] = useSetting('terminalFontSize');
  const [live, setLive] = useState<number | null>(null);
  const start = useRef(saved);
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
  return <GestureDetector gesture={pinch}>{children(live ?? saved)}</GestureDetector>;
}
