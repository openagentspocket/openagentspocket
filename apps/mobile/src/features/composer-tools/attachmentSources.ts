import { AttachmentError, type AttachmentSource, type LocalFiles } from '@openagentspocket/core';
import { ATTACHMENT_LIMITS, type StageableAttachment } from '@openagentspocket/transport';
import type { Picked } from '@/files/pickers';

/** The part of the phone's local files an attachment needs. */
export type AttachmentLocalFiles = Pick<LocalFiles, 'size' | 'readAll' | 'remove'>;

const MAX_NAME_CHARACTERS = 120;

/** The picked file's own name, made safe as one Host path component. */
export function remoteFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  let cleaned = '';
  for (const char of base) {
    const code = char.codePointAt(0) ?? 0;
    cleaned += code < 0x20 || code === 0x7f ? '_' : char;
  }
  cleaned = cleaned.trim().replace(/^\.+/, '');
  const trimmed = [...cleaned].slice(0, MAX_NAME_CHARACTERS).join('');
  return trimmed === '' ? 'file' : trimmed;
}

/** `image.<ext>` for an image: the Host sees a neutral name, never the photo's own. */
export function remoteImageName(extension: string): string {
  const safe = extension.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `image.${safe === '' ? 'jpg' : safe.slice(0, 8)}`;
}

/**
 * A picked file or photo as a staging source. Preparation checks it is still there and within the
 * medium's limit; the bytes are read at upload time. The picker already copied it into the cache,
 * so `remove` deletes that copy once staged; a photo's copy is its preview, and stays until the
 * Composer releases it.
 */
export function attachmentSource(
  medium: 'image' | 'file',
  picked: Picked,
  files: AttachmentLocalFiles,
): AttachmentSource {
  return {
    medium,
    label:
      medium === 'image' ? { name: picked.name, previewUri: picked.uri } : { name: picked.name },
    prepare: async (signal) => {
      const size = await files.size(picked.uri);
      if (signal.aborted) throw new AttachmentError('cancelled');
      if (size === null) throw new AttachmentError('selectionUnavailable');
      if (size > ATTACHMENT_LIMITS[medium]) {
        throw new AttachmentError(
          medium === 'image' ? 'unableToProduceBoundedOutput' : 'sourceTooLarge',
        );
      }
      const prepared: StageableAttachment = {
        medium,
        byteCount: size,
        remoteFilename:
          medium === 'image' ? remoteImageName(picked.extension) : remoteFileName(picked.name),
        read: () => files.readAll(picked.uri),
        remove: () => files.remove(picked.uri),
      };
      return prepared;
    },
  };
}
