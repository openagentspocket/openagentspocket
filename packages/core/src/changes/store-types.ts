import type { Translate } from '../errors/text';
import type { CancelSignal, Clock } from '../hosts/cancellation';
import type { AgentStatusSource } from './auto-refresh';
import type { ByteString } from './bytes';
import type { ExecGate } from './observable';
import type { Say } from './say';
import {
  type ChangedFile,
  ChangesReadError,
  type ChangesReadReason,
  type ChangesReadRequest,
  type CheckoutChanges,
  type CheckoutChangesRead,
  type FilePatch,
  type FilePatchRequest,
  type UntrackedDirectoryListing,
  type UntrackedDirectoryRequest,
} from './types';

export type ChangesPhase =
  /** No read has completed yet. */
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded'; readonly changes: CheckoutChanges }
  /** Git's answer: not a working tree, missing, too old, ownership, incomplete, or its own line. */
  | { readonly kind: 'readFailed'; readonly reason: ChangesReadReason }
  | { readonly kind: 'timedOut' }
  | { readonly kind: 'failed'; readonly message: string };

export interface ChangesState {
  readonly phase: ChangesPhase;
  /** A read is running while content from an earlier read stays on screen. */
  readonly isRefreshing: boolean;
  /** Where the Agent's directory sits inside the Checkout, raw bytes; empty at the top level. */
  readonly directoryPrefix: ByteString;
  /** A timed-out refresh keeps the last document, identity and scroll position. */
  readonly timedOutKeepingContent: boolean;
  /** When the document on screen was read (epoch ms). */
  readonly readAt: number | null;
  /** Set while the document may predate edits the Agent is still making: when it was read. */
  readonly freshness: number | null;
}

export interface ChangesStoreOptions {
  /** Asked on every read, so an Agent that moved to another Checkout is read where it is now. */
  readonly directory: () => string | null;
  readonly read: (
    request: ChangesReadRequest,
    signal: CancelSignal,
  ) => Promise<CheckoutChangesRead>;
  readonly readPatch?: (request: FilePatchRequest, signal: CancelSignal) => Promise<FilePatch>;
  readonly listUntrackedDirectory?: (
    request: UntrackedDirectoryRequest,
    signal: CancelSignal,
  ) => Promise<UntrackedDirectoryListing>;
  /** The Host's one-git-exec-at-a-time gate, shared by every store of the Host. */
  readonly gate?: ExecGate;
  readonly agentStatus?: AgentStatusSource;
  readonly clock: Clock;
  readonly now?: () => number;
  /** Receives 'Checkout Changes updated.' when an automatic read changed the files. */
  readonly announce?: (message: string) => void;
  readonly say?: Say;
  readonly translate?: Translate;
}

export const UNAVAILABLE = () => Promise.reject(new ChangesReadError({ kind: 'unavailable' }));

/** An Agents list row waits this long before its first read, so scrolling past costs no exec. */
export const APPEARANCE_SETTLE_MS = 300;

export function sameFiles(lhs: readonly ChangedFile[], rhs: readonly ChangedFile[]): boolean {
  return (
    lhs.length === rhs.length &&
    lhs.every((file, index) => {
      const other = rhs[index];
      return (
        other !== undefined &&
        file.path === other.path &&
        file.kind === other.kind &&
        file.staging === other.staging &&
        file.originalPath === other.originalPath &&
        JSON.stringify(file.lineCounts) === JSON.stringify(other.lineCounts)
      );
    })
  );
}
