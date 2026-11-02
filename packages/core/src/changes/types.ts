import type { ByteString } from './bytes';

export type FileKind = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';

/** Whether the change is in the index, the working tree, or both. Untracked/conflicted: none. */
export type Staging = 'staged' | 'unstaged' | 'both';

/** Tracked text counts against HEAD, or a binary change without line counts. */
export type LineCounts =
  | { readonly kind: 'lines'; readonly added: number; readonly removed: number }
  | { readonly kind: 'binary' };

/** One uncommitted file, keyed by the raw bytes of its status record. */
export interface ChangedFile {
  /** Relative to the Checkout's top level, raw bytes. */
  readonly path: ByteString;
  /** A staged rename's previous path. */
  readonly originalPath: ByteString | null;
  readonly kind: FileKind;
  readonly staging: Staging | null;
  readonly lineCounts: LineCounts | null;
}

export interface CheckoutLocation {
  /** `--show-toplevel`, raw bytes. */
  readonly topLevel: ByteString;
  readonly isLinkedWorktree: boolean;
  /** The top level with the Host's home directory shortened to `~`. */
  readonly displayPath: string;
}

export interface LatestCommit {
  readonly subject: string;
  /** Committer timestamp, epoch milliseconds. */
  readonly committedAt: number;
}

export type UpstreamState =
  | { readonly kind: 'tracking'; readonly ahead: number; readonly behind: number }
  | { readonly kind: 'deleted' }
  | { readonly kind: 'unknown' };

export interface CheckoutUpstream {
  readonly name: string;
  readonly state: UpstreamState;
}

export type Branch =
  | { readonly kind: 'named'; readonly name: string }
  | { readonly kind: 'detached' };

export interface CheckoutHead {
  readonly branch: Branch;
  /** Full object id; null while HEAD is unborn. */
  readonly commit: string | null;
  readonly latestCommit: LatestCommit | null;
  readonly upstream: CheckoutUpstream | null;
  readonly isUnborn: boolean;
}

/** Computed before any display limit. Untracked directories count as one item. */
export interface ChangesTotals {
  readonly trackedFiles: number;
  readonly untrackedItems: number;
  readonly added: number;
  readonly removed: number;
  readonly linesAreComplete: boolean;
  readonly linesAreAvailable: boolean;
}

export interface CheckoutChanges {
  readonly checkout: CheckoutLocation;
  readonly head: CheckoutHead;
  /** Conflicted files first, then everything else by raw path bytes. */
  readonly files: readonly ChangedFile[];
  readonly totals: ChangesTotals;
  /** The Host's status output was capped, so `files.length` is a lower bound. */
  readonly isStatusTruncated: boolean;
  /** Counts or latest-commit output exceeded its Host-side cap. */
  readonly isMetadataTruncated: boolean;
}

export interface CheckoutChangesRead {
  readonly changes: CheckoutChanges;
  /** Where the requested directory sits inside the Checkout (`--show-prefix`), raw bytes. */
  readonly directoryPrefix: ByteString;
}

export interface ChangesReadRequest {
  /** The Agent's current directory on the Host. */
  readonly directory: string;
}

export interface UntrackedDirectoryRequest {
  readonly topLevel: ByteString;
  /** Relative to the top level, trailing slash included. */
  readonly directory: ByteString;
}

export interface UntrackedDirectoryListing {
  readonly directory: ByteString;
  readonly entries: readonly ChangedFile[];
  /** Complete untracked records, before the display limit. */
  readonly total: number;
  readonly isTruncated: boolean;
  /** Git refused to descend: this directory is its own repository. */
  readonly isSeparateRepository: boolean;
  /** Present when not every entry fits (a `Say` key and its arguments are built by the caller). */
  readonly limitNotice: LimitNotice | null;
}

export interface LimitNotice {
  readonly shown: number;
  readonly total: number;
  readonly isLowerBound: boolean;
  readonly noun: 'changed files' | 'files';
}

export type PatchLimit = 'initial' | 'extended';

export interface FilePatchRequest {
  readonly topLevel: ByteString;
  readonly path: ByteString;
  readonly originalPath: ByteString | null;
  readonly isUntracked: boolean;
  readonly limit: PatchLimit;
}

export interface DiffLine {
  readonly id: number;
  readonly kind: 'added' | 'removed' | 'context';
  readonly oldNumber: number | null;
  readonly newNumber: number | null;
  readonly text: string;
  readonly missingNewline: boolean;
}

export interface DiffHunk {
  readonly id: number;
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
  readonly section: string;
  readonly lines: readonly DiffLine[];
}

export interface DiffFile {
  readonly id: number;
  readonly oldPath: string | null;
  readonly newPath: string | null;
  /** Metadata notes (rename, mode change, binary, empty file), joined; not localized. */
  readonly notes: readonly DiffNote[];
  readonly isBinary: boolean;
  readonly hunks: readonly DiffHunk[];
}

export type DiffNote =
  | { readonly kind: 'binary' }
  | { readonly kind: 'renamed'; readonly from: string; readonly to: string }
  | { readonly kind: 'mode'; readonly from: string; readonly to: string }
  | { readonly kind: 'newEmpty' }
  | { readonly kind: 'deletedEmpty' };

export interface FilePatch {
  readonly files: readonly DiffFile[];
  readonly isTruncated: boolean;
}

/** Git-level outcomes of a Changes read. Transport failures stay `TransportError`s. */
export type ChangesReadReason =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'notAGitWorkingTree' }
  | { readonly kind: 'incomplete' }
  | { readonly kind: 'gitFailed'; readonly line: string }
  | { readonly kind: 'gitMissing' }
  | { readonly kind: 'gitTooOld'; readonly version: string }
  | { readonly kind: 'notOwnedByAccount' }
  | { readonly kind: 'directoryMissing' }
  | { readonly kind: 'lineBreakInPath' };

export class ChangesReadError extends Error {
  constructor(readonly reason: ChangesReadReason) {
    super(reason.kind);
    this.name = 'ChangesReadError';
  }
}
