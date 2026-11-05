import type { ReactNode } from 'react';
import type { SheetBarAction } from './SheetContent';
import type { SheetDetent } from './sheetDetents';

export interface SheetProps {
  visible: boolean;
  /** Called on the close button, a backdrop tap and the Android back button. */
  onClose: () => void;
  /** After the close animation ended, on every platform: where a sheet hands over to a route, which cannot present while it is still leaving. */
  onDismissed?: () => void;
  title?: string;
  /**
   * Where the sheet opens. Default `fit`: as tall as its content (at least `sheetMinShare` of the
   * window, at most `sheetMaxShare`), scrolling only past that. `medium`/`large`/`{ fraction }` fix a height.
   */
  detent?: SheetDetent;
  /** Screen-reader label of the close button. Default "Close". */
  closeLabel?: string;
  /** Leading bar action (Cancel, Done). Replaces the trailing close button. */
  leading?: SheetBarAction;
  /** Trailing bar action (Start, Save): the confirm of a form sheet. */
  trailing?: SheetBarAction;
  /** Title drawn large under the bar (Settings, Hosts) instead of inline. */
  largeTitle?: boolean;
  /** False on an untitled sheet that dismisses by swipe or backdrop (the quick detail): no header row. */
  closeButton?: boolean;
  /** No bar and no title row: the content draws its own header (a day sheet). */
  headerless?: boolean;
  /** Hide the grabber (large form sheets). Default shown. */
  grabber?: boolean;
  /** Pinned under the scrolling body (a primary action). */
  footer?: ReactNode;
  children: ReactNode;
  testID?: string;
}
