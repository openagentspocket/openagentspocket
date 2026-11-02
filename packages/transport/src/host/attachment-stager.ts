import {
  AttachmentError,
  type AttachmentErrorKind,
  type AttachmentStager,
  FILE_LIMITS,
  type PreparedAttachment,
  TransportFailure,
} from '@openagentspocket/core';
import type { SshTransport } from '../transport';
import { type StagingSource, stageAttachment } from './staging';

/** A prepared attachment that can also be read and named for the Host. */
export interface StageableAttachment extends PreparedAttachment, StagingSource {}

/** The largest attachment per medium (the Swift app: 16 MiB images, 64 MiB files). */
export const ATTACHMENT_LIMITS = {
  image: 16 * 1024 * 1024,
  file: FILE_LIMITS.uploadBytes,
} as const;

function asAttachmentError(thrown: unknown): unknown {
  if (thrown instanceof TransportFailure) return thrown;
  if (thrown instanceof Error && thrown.name === 'StagingError') {
    return new AttachmentError((thrown as Error & { kind: AttachmentErrorKind }).kind);
  }
  return thrown;
}

/**
 * The `AttachmentStager` the Composer staging store uses: SFTP into private Host temporary
 * storage (ADR 0006). Staging errors become `AttachmentError`s of the same kind.
 */
export function attachmentStager(transport: SshTransport): AttachmentStager {
  return async (prepared, { onProgress, signal }) => {
    try {
      return await stageAttachment(transport, prepared as StageableAttachment, {
        maxBytes: ATTACHMENT_LIMITS[prepared.medium],
        onProgress,
        signal,
      });
    } catch (thrown) {
      throw asAttachmentError(thrown);
    }
  };
}
