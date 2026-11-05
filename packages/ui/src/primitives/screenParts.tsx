import { type RefObject, useCallback, useRef, useState } from 'react';
import { useWindowDimensions, View, type ViewInstance } from 'react-native';
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
