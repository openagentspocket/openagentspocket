import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/** How close to the newest row still counts as reading it, in points. */
const NEAR_NEWEST = 120;

interface OffsetScroller {
  scrollToOffset(options: { offset: number; animated: boolean }): void;
}

/**
 * Keeps an inverted timeline on its newest row. Offset 0 is the newest row, so a list opens there,
 * and keeps it when the keyboard or the composer shrink it. New rows: the list follows a reader
 * near the newest row and holds one who scrolled up (`maintainVisibleContentPosition`). A message
 * sent, a return to the screen or to the app from the background brings the reader back to it.
 */
export function useChatFollow(list: RefObject<OffsetScroller | null>, sent: number, visit = 0) {
  const toNewest = useCallback(
    () => list.current?.scrollToOffset({ offset: 0, animated: false }),
    [list],
  );

  const last = useRef({ sent, visit });
  useEffect(() => {
    if (sent > last.current.sent || visit > last.current.visit) toNewest();
    last.current = { sent, visit };
  }, [sent, visit, toNewest]);

  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (state) => {
      // A Face ID prompt only makes the app inactive: the reader stays where they were.
      if (state === 'active' && previous === 'background') toNewest();
      previous = state;
    });
    return () => subscription.remove();
  }, [toNewest]);

  return {
    maintainVisibleContentPosition: {
      minIndexForVisible: 0,
      autoscrollToTopThreshold: NEAR_NEWEST,
    },
  };
}
