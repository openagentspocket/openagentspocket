import type { WindowFrame } from './windowFrame';

/** The room a popover has: the window, its safe insets and the margin it keeps from the edges. */
export interface PopoverRoom {
  windowWidth: number;
  windowHeight: number;
  insetTop: number;
  insetBottom: number;
  margin: number;
  /** Where an unanchored menu sits above the window's bottom. */
  unanchoredBottom: number;
}

export interface PopoverPosition {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

/** The space between the anchor and the panel. */
const GAP = 4;

/**
 * Where an anchored popover goes. Horizontally it lines up with the side of the screen its anchor
 * is on (a leading pill opens leading-aligned, a trailing "more" trailing-aligned), kept inside the
 * margins. Vertically it opens under the anchor when its estimated height fits, else above it,
 * else as high as it must to show everything (scrolling past the room it gets). Without an anchor
 * it is centered near the bottom.
 */
export function placePopover(
  anchor: WindowFrame | undefined,
  width: number,
  estimated: number,
  room: PopoverRoom,
): PopoverPosition {
  const { windowWidth, windowHeight, insetTop, insetBottom, margin } = room;
  const highest = insetTop + margin;
  const lowest = windowHeight - insetBottom - margin;
  if (!anchor) {
    return {
      left: (windowWidth - width) / 2,
      bottom: room.unanchoredBottom,
      maxHeight: lowest - highest,
    };
  }
  const leading = anchor.x + anchor.width / 2 < windowWidth / 2;
  const preferred = leading ? anchor.x : anchor.x + anchor.width - width;
  const left = Math.min(Math.max(margin, preferred), windowWidth - width - margin);
  const below = anchor.y + anchor.height + GAP;
  const above = anchor.y - GAP;
  if (below + estimated < lowest) return { left, top: below, maxHeight: lowest - below };
  if (above - estimated > highest) {
    return { left, bottom: windowHeight - above, maxHeight: above - highest };
  }
  return { left, top: Math.max(highest, lowest - estimated), maxHeight: lowest - highest };
}
