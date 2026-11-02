/** How far past the start a swipe must travel to snap open. */
export const OPEN_THRESHOLD = 40;
/** Share of the row width a full swipe must pass to commit its action. */
export const FULL_SWIPE_SHARE = 0.55;
/** Rubber-band limit when an edge has no full swipe: the buttons' width times this. */
export const OVERSHOOT = 1.2;

export interface SwipeEdges {
  /** Total width of the leading buttons (revealed by swiping right). */
  leading: number;
  /** Total width of the trailing buttons (revealed by swiping left). */
  trailing: number;
  leadingFull: boolean;
  trailingFull: boolean;
  rowWidth: number;
}

/** Where the front rests while open: positive = leading buttons showing, negative = trailing. */
export type SwipeRest = 'closed' | 'leading' | 'trailing';

export function restOffset(rest: SwipeRest, edges: SwipeEdges): number {
  if (rest === 'leading') return edges.leading;
  if (rest === 'trailing') return -edges.trailing;
  return 0;
}

/** The front's offset while dragging `dx` from `rest`, clamped at the edges. */
export function dragOffset(dx: number, rest: SwipeRest, edges: SwipeEdges): number {
  const raw = restOffset(rest, edges) + dx;
  const maxRight = edges.leading
    ? edges.leadingFull
      ? edges.rowWidth
      : edges.leading * OVERSHOOT
    : 0;
  const maxLeft = edges.trailing
    ? edges.trailingFull
      ? edges.rowWidth
      : edges.trailing * OVERSHOOT
    : 0;
  return Math.min(maxRight, Math.max(-maxLeft, raw));
}

/** True once the dragged offset passes the full-swipe line on an edge that has one. */
export function passedFullSwipe(offset: number, edges: SwipeEdges): 'leading' | 'trailing' | null {
  const line = edges.rowWidth * FULL_SWIPE_SHARE;
  if (edges.leadingFull && offset > line) return 'leading';
  if (edges.trailingFull && -offset > line) return 'trailing';
  return null;
}

export type SwipeOutcome = SwipeRest | 'commit-leading' | 'commit-trailing';

/** What a released drag does. */
export function settleSwipe(offset: number, rest: SwipeRest, edges: SwipeEdges): SwipeOutcome {
  const full = passedFullSwipe(offset, edges);
  if (full) return `commit-${full}`;
  if (offset > OPEN_THRESHOLD && edges.leading) return 'leading';
  if (offset < -OPEN_THRESHOLD && edges.trailing) return 'trailing';
  // Less than the threshold from a rest position closes only when pulled back far enough.
  if (rest !== 'closed' && Math.abs(offset - restOffset(rest, edges)) < OPEN_THRESHOLD) {
    return rest;
  }
  return 'closed';
}
