import { type RefObject, useCallback, useRef, useState } from 'react';
import {
  Keyboard,
  type LayoutChangeEvent,
  useWindowDimensions,
  View,
  type ViewInstance,
} from 'react-native';
import { LargeTitleBar, type TitleBarAction } from '../components/LargeTitleBar';
import { SheetBar, type SheetBarItem } from '../components/SheetBar';

/**
 * The three headers a screen can have. `native` draws nothing here (the navigator's header sits above
 * the screen, which then drops its own top inset); `large` is the title with a capsule of actions
 * (Home, Agents); `sheet` is the glass bar of a modal (Done, Cancel, back, an actions capsule), with an
 * optional large title under it.
 */
export type ScreenHeader =
  | {
      variant: 'native';
      /** The navigator's title; read by the app's `AppScreen`, not drawn here. */
      title?: string;
    }
  | { variant: 'large'; title: string; actions?: readonly TitleBarAction[] }
  | {
      variant: 'sheet';
      title: string;
      subtitle?: string;
      /** Large bold title under the bar instead of centered in it. */
      large?: boolean;
      leading?: SheetBarItem;
      back?: boolean;
      trailing?: readonly SheetBarItem[];
      /** Tops a pushed full screen rather than a sheet (see `SheetBar`). */
      fullScreen?: boolean;
      testID?: string;
    };

/**
 * How much of the screen's frame lies below the window. A form sheet at a partial detent is as tall as
 * its largest detent but only the top part is on screen, so the bottom of the content (and of the
 * scroll) would sit in a dead block under the edge; the screen pads itself by that amount.
 */
export function useOffscreenBottom(): {
  hidden: number;
  ref: RefObject<ViewInstance | null>;
  onLayout: () => void;
} {
  const ref = useRef<ViewInstance>(null);
  const { height: windowHeight } = useWindowDimensions();
  const [hidden, setHidden] = useState(0);
  const onLayout = useCallback(() => {
    ref.current?.measureInWindow?.((_x, y, _width, height) =>
      setHidden(Math.max(0, Math.round(y + height - windowHeight))),
    );
  }, [windowHeight]);
  return { hidden, ref, onLayout };
}

/**
 * What a full-bleed screen's KeyboardAvoidingView must add to its own frame. The view compares the
 * keyboard's screen position with a frame relative to its parent, which ends short by whatever sits
 * above the parent (the status bar area), and the lift ends short with it: the bottom of the screen
 * stays that far under the keyboard. Neither `measureInWindow` nor a child's layout see that distance
 * (both read 0 here), so it comes from what is known: where the frame really ends, the window's
 * height less the gap under the view.
 */
export function keyboardOffset(windowHeight: number, gapBelow: number, frameEnd: number): number {
  return frameEnd > 0 ? Math.max(0, windowHeight - gapBelow - frameEnd) : 0;
}

/** Feeds `keyboardOffset` the view's resting frame: the 'height' behavior shrinks it under a keyboard. */
export function useKeyboardOffset(gapBelow: number): {
  offset: number;
  onLayout: (event: LayoutChangeEvent) => void;
} {
  const { height } = useWindowDimensions();
  const [frameEnd, setFrameEnd] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { y, height: frame } = event.nativeEvent.layout;
    if (!Keyboard.isVisible()) setFrameEnd(y + frame);
  }, []);
  return { offset: keyboardOffset(height, gapBelow, frameEnd), onLayout };
}

/** Draws the header of a `large` or `sheet` screen; a native header is the navigator's. */
export function ScreenHeaderBar({ header }: { header: ScreenHeader | undefined }) {
  if (header?.variant === 'large') {
    return <LargeTitleBar title={header.title} actions={header.actions ?? []} />;
  }
  if (header?.variant === 'sheet') {
    const { variant: _variant, ...bar } = header;
    return <SheetBar {...bar} />;
  }
  return null;
}
