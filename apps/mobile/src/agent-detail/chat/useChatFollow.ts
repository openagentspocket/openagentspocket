import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { AppState, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

/** How far from the end still counts as reading the newest row, in points. */
const NEAR_END = 120;
/** Rows below the window are measured as they render, so one jump lands short of the real end. */
const SETTLE_MS = [150, 400] as const;

interface EndScroller {
  scrollToEnd(options: { animated: boolean }): void;
}

/**
 * Keeps the timeline on its newest row while the reader is there, whatever moves it: a new row, a
 * row replaced, a smaller list when the keyboard or the composer change, a return to the app. A
 * message the reader sends brings them back to the end. Only a drag lets go of it.
 */
export function useChatFollow(list: RefObject<EndScroller | null>, sent: number) {
  const following = useRef(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stick = useCallback(() => {
    if (!following.current) return;
    list.current?.scrollToEnd({ animated: false });
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = SETTLE_MS.map((ms) =>
      setTimeout(() => following.current && list.current?.scrollToEnd({ animated: false }), ms),
    );
  }, [list]);

  const lastSent = useRef(sent);
  useEffect(() => {
    if (sent > lastSent.current) {
      following.current = true;
      stick();
    }
    lastSent.current = sent;
  }, [sent, stick]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') stick();
    });
    return () => {
      subscription.remove();
      for (const timer of timers.current) clearTimeout(timer);
    };
  }, [stick]);

  const settle = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    following.current = contentSize.height - contentOffset.y - layoutMeasurement.height < NEAR_END;
  }, []);

  return {
    onScrollBeginDrag: () => {
      following.current = false;
    },
    onScrollEndDrag: settle,
    onMomentumScrollEnd: settle,
    onContentSizeChange: stick,
    onLayout: stick,
  };
}
