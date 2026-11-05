import type { ChangesState } from './store-types';
import type { CheckoutChanges } from './types';

/** What the status line and the Agents rows show of a Checkout: the git facts, nothing to render. */
export interface GitStatus {
  /** The named branch; null while HEAD is detached. */
  readonly branch: string | null;
  readonly isDetached: boolean;
  /** Commits ahead of and behind the upstream; 0 without one. */
  readonly ahead: number;
  readonly behind: number;
  /** Files with unstaged changes (Tide's `!`); a file both staged and modified counts in both. */
  readonly changed: number;
  readonly staged: number;
  readonly untracked: number;
  readonly conflicts: number;
  /** Lines added and removed against HEAD; absent when git could not count them. */
  readonly diff?: { readonly added: number; readonly removed: number };
  /** The Host's output was capped, so the counts are lower bounds. */
  readonly isTruncated: boolean;
}

/** The facts of one read, by the Swift status line's rules: counts before any display limit. */
export function gitStatusOf(changes: CheckoutChanges): GitStatus {
  const { head, totals, files } = changes;
  const tracking = head.upstream?.state.kind === 'tracking' ? head.upstream.state : null;
  const open = files.filter((file) => file.kind !== 'conflicted');
  return {
    branch: head.branch.kind === 'named' ? head.branch.name : null,
    isDetached: head.branch.kind === 'detached',
    ahead: tracking?.ahead ?? 0,
    behind: tracking?.behind ?? 0,
    changed: open.filter((f) => f.staging === 'unstaged' || f.staging === 'both').length,
    staged: open.filter((f) => f.staging === 'staged' || f.staging === 'both').length,
    untracked: totals.untrackedItems,
    conflicts: files.length - open.length,
    diff: totals.linesAreAvailable ? { added: totals.added, removed: totals.removed } : undefined,
    isTruncated: changes.isStatusTruncated || changes.isMetadataTruncated,
  };
}

/** The status of a store's document: null until a read has completed (a later failure keeps it). */
export function gitStatusOfState(state: ChangesState): GitStatus | null {
  return state.phase.kind === 'loaded' ? gitStatusOf(state.phase.changes) : null;
}
