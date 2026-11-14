import type { MenuAnchor } from './ActionMenu';

export interface PopoverPlacementInput {
  /** The trigger's frame in window coordinates; absent when it could not be measured. */
  anchor: MenuAnchor | undefined;
  width: number;
  /** The panel's height before it is laid out. */
  estimated: number;
  window: { width: number; height: number };
  insets: { top: number; bottom: number };
  /** Side and edge margin. */
  margin: number;
  /** The space between the anchor and the panel. */
  gap: number;
  /** Where the panel goes with no anchor: its distance above the bottom inset. */
  fallbackBottom: number;
}

export interface PopoverPlacement {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

/**
 * Where a popover menu goes. Under its anchor when it fits, else above, else on the roomier side
 * with the panel scrolling inside: the anchor is never covered by its own menu. Horizontally it
 * lines up with the anchor's leading edge, or its trailing edge for an anchor in the right half.
 */
export function placePopover(input: PopoverPlacementInput): PopoverPlacement {
  const { anchor, width, estimated, window, insets, margin, gap, fallbackBottom } = input;
  const highest = insets.top + margin;
  const lowest = window.height - insets.bottom - margin;
  const clampLeft = (left: number) =>
    Math.min(Math.max(margin, left), window.width - width - margin);
  // A zero frame is a view that has not laid out yet: no anchor to respect.
  if (!anchor || (anchor.width === 0 && anchor.height === 0)) {
    return {
      left: clampLeft((window.width - width) / 2),
      bottom: insets.bottom + fallbackBottom,
      maxHeight: lowest - highest,
    };
  }
  const trailing = anchor.x + anchor.width / 2 > window.width / 2;
  const left = clampLeft(trailing ? anchor.x + anchor.width - width : anchor.x);
  const below = anchor.y + anchor.height + gap;
  const roomBelow = lowest - below;
  const roomAbove = anchor.y - gap - highest;
  if (estimated <= roomBelow) return { left, top: below, maxHeight: roomBelow };
  if (estimated <= roomAbove) {
    return { left, bottom: window.height - anchor.y + gap, maxHeight: roomAbove };
  }
  return roomBelow >= roomAbove
    ? { left, top: below, maxHeight: Math.max(roomBelow, 0) }
    : { left, bottom: window.height - anchor.y + gap, maxHeight: Math.max(roomAbove, 0) };
}
