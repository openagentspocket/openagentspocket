import type { Text } from '../errors/text';

export type AttachmentMedium = 'image' | 'file';

export interface AttachmentProgress {
  readonly transferredBytes: number;
  readonly totalBytes: number;
}

export function attachmentProgressFraction(progress: AttachmentProgress): number {
  if (progress.totalBytes <= 0) return 0;
  return Math.min(1, Math.max(0, progress.transferredBytes / progress.totalBytes));
}

/** Why preparing or staging one attachment failed (Swift `AttachmentStagingError` + preparers). */
export type AttachmentErrorKind =
  | 'invalidRemotePath'
  | 'invalidPreparedSource'
  | 'localReadFailed'
  | 'remoteTemporaryDirectoryFailed'
  | 'sftpUnavailable'
  | 'permissionEnforcementFailed'
  | 'byteCountMismatch'
  | 'transferFailed'
  | 'cancelled'
  | 'selectionUnavailable'
  | 'sourceTooLarge'
  | 'invalidImage'
  | 'unableToProduceBoundedOutput'
  | 'localStorageFailed';

export class AttachmentError extends Error {
  override readonly name = 'AttachmentError';
  constructor(readonly kind: AttachmentErrorKind) {
    super(`AttachmentError.${kind}`);
  }

  /** Only a failed transfer or a cancel is worth trying again unchanged. */
  get isRetryable(): boolean {
    return this.kind === 'transferFailed' || this.kind === 'cancelled';
  }
}

/** A local attachment ready to upload. The store owns it until it is staged or discarded. */
export interface PreparedAttachment {
  readonly medium: AttachmentMedium;
  readonly byteCount: number;
  /** Deletes the prepared local copy. */
  remove(): void | Promise<void>;
}

/** What the user picked, before it is prepared (a photo selection, a file URI). */
export interface AttachmentSource {
  readonly medium: AttachmentMedium;
  prepare(signal: AbortSignalLike): Promise<PreparedAttachment>;
}

/** The part of AbortSignal the store hands to ports. */
export interface AbortSignalLike {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

/** Uploads a prepared attachment to the Host and returns its absolute path. */
export type AttachmentStager = (
  prepared: PreparedAttachment,
  options: { onProgress(progress: AttachmentProgress): void; signal: AbortSignalLike },
) => Promise<string>;

export interface AttachmentClipboard {
  copy(text: string): void | Promise<void>;
}

/** The Composer (or terminal) draft the staged path is inserted into. */
export interface ComposerDraftPort {
  insertIntoDraft(text: string): void;
}

export interface AttachmentFailure {
  readonly medium: AttachmentMedium;
  readonly message: Text;
  readonly isRetryable: boolean;
}

export interface AttachmentOutcome {
  readonly medium: AttachmentMedium;
  readonly path: string;
  readonly copied: boolean;
}

export type AttachmentState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'preparing'; readonly medium: AttachmentMedium }
  | {
      readonly kind: 'uploading';
      readonly medium: AttachmentMedium;
      readonly progress: AttachmentProgress;
    }
  | { readonly kind: 'failed'; readonly failure: AttachmentFailure }
  | { readonly kind: 'backgroundInterrupted'; readonly failure: AttachmentFailure }
  | { readonly kind: 'completed'; readonly outcome: AttachmentOutcome };

export function isBusy(state: AttachmentState): boolean {
  return state.kind === 'preparing' || state.kind === 'uploading';
}

export type AttachmentCommand = 'cancel' | 'retry' | 'copyPath' | 'dismiss';

/** Terminal outcomes of one `begin`; Composer drop uses the id to fulfil a placeholder. */
export type AttachmentOperationEvent =
  | { readonly kind: 'completed'; readonly id: number; readonly path: string }
  | { readonly kind: 'cancelled'; readonly id: number }
  | { readonly kind: 'failed'; readonly id: number; readonly retryable: boolean }
  | { readonly kind: 'dismissed'; readonly id: number };
