import { errorMessage } from '../errors/message';
import { presentation } from '../errors/presentation';
import { message, type Text } from '../errors/text';
import { TransportFailure } from '../errors/transport-error';
import { CancelledError } from '../hosts/cancellation';
import { FILE_LIMITS } from './limits';

export type FileBrowserErrorKind =
  | 'notFound'
  | 'permissionDenied'
  | 'alreadyExists'
  | 'directoryNotEmpty'
  | 'notAFile'
  | 'tooLarge'
  | 'invalidName'
  | 'protectedItem'
  | 'unusableName'
  | 'timedOut'
  | 'sftpUnavailable'
  | 'transferIncomplete'
  | 'localStorageFailed'
  | 'refused';

/**
 * Why a file browser operation failed when the failure is the file's, not the link's: these never
 * make the Host reconnect. A lost link surfaces as a TransportFailure, as everywhere else.
 */
export class FileBrowserError extends Error {
  constructor(
    readonly kind: FileBrowserErrorKind,
    readonly detail?: { limit?: number; reason?: Text; status?: number },
  ) {
    super(kind);
    this.name = 'FileBrowserError';
  }

  /** SFTP v3 statuses: 2 no such file, 3 permission denied, 10 no such path. */
  static fromSftpStatus(status: number): FileBrowserError {
    if (status === 2 || status === 10) return new FileBrowserError('notFound');
    if (status === 3) return new FileBrowserError('permissionDenied');
    return new FileBrowserError('refused', { status });
  }

  get text(): Text {
    switch (this.kind) {
      case 'notFound':
        return message('It is no longer on the Host.');
      case 'permissionDenied':
        return message('The Host does not let this account do that.');
      case 'alreadyExists':
        return message('An item with that name already exists.');
      case 'directoryNotEmpty':
        return message('Folder is not empty. Delete its contents on the Host.');
      case 'notAFile':
        return message('Only regular files can be downloaded.');
      case 'tooLarge':
        return message(
          'Larger than %@, the most Files moves at once.',
          formatBytes(this.detail?.limit ?? 0),
        );
      case 'invalidName':
        return this.detail?.reason ?? message('Enter a name.');
      case 'protectedItem':
        return message(
          "The Host's root and the folders in it, your home folder, and the folder Files opened at cannot be renamed or deleted.",
        );
      case 'unusableName':
        return message(
          'Files cannot send this name back to the Host: it is not valid UTF-8 or holds control characters. Use a shell on the Host for it.',
        );
      case 'timedOut':
        return message('The Host took too long to answer. Try again.');
      case 'sftpUnavailable':
        return message('Files needs SFTP on the Host.');
      case 'transferIncomplete':
        return message('The transfer ended early. Nothing was replaced.');
      case 'localStorageFailed':
        return message('The file could not be stored on this device.');
      case 'refused':
        return message('The Host refused (SFTP status %@).', String(this.detail?.status ?? 0));
      default:
        return message('Something went wrong: %@', this.kind);
    }
  }
}

export type FilePreparationKind = 'selectionUnavailable' | 'sourceTooLarge' | 'localStorageFailed';

/** A picked document or photo that could not become a private local copy. */
export class FilePreparationError extends Error {
  constructor(readonly kind: FilePreparationKind) {
    super(kind);
    this.name = 'FilePreparationError';
  }
}

export const tooLarge = (limit: number) => new FileBrowserError('tooLarge', { limit });

/** Binary units, one decimal at most: "64 MB" style, as the byte-count formatter reads. */
export function formatBytes(bytes: number): string {
  const units = ['bytes', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${rounded} ${units[unit]}`;
}

/** The SFTP status inside an SshError message ("SFTP status 4"), when the native layer gave one. */
export function sftpStatusOf(error: unknown): number | null {
  const match = /status (\d+)/i.exec(error instanceof Error ? error.message : '');
  return match ? Number(match[1]) : null;
}

const code = (error: unknown): string | undefined =>
  (error as { code?: unknown } | null)?.code as string | undefined;

/**
 * Classifies a thrown value the way the file browser owns it: its own errors as they are, SFTP and
 * timeout failures from the SSH module as file failures, cancellation as CancelledError. Anything
 * else (a dead link) is null: the caller reports it as the TransportError it is.
 */
export function fileBrowserFailure(error: unknown): Error | null {
  if (error instanceof FileBrowserError || error instanceof CancelledError) return error;
  switch (code(error)) {
    case 'cancelled':
      return new CancelledError();
    case 'timedOut':
      return new FileBrowserError('timedOut');
    case 'sftpUnavailable':
      return new FileBrowserError('sftpUnavailable');
    case 'sftpFailure': {
      const status = sftpStatusOf(error);
      return status === null
        ? new FileBrowserError('refused', { status: 0 })
        : FileBrowserError.fromSftpStatus(status);
    }
    default:
      return null;
  }
}

/** What the screen shows for any failure of a file browser operation. */
export function failureText(error: unknown): Text {
  const own = fileBrowserFailure(error);
  if (own instanceof FileBrowserError) return own.text;
  if (error instanceof FilePreparationError) {
    return error.kind === 'sourceTooLarge'
      ? new FileBrowserError('tooLarge', { limit: FILE_LIMITS.uploadBytes }).text
      : message('That file could not be read on this device.');
  }
  if (own) return message('Something went wrong: %@', own.message);
  if (error instanceof TransportFailure) {
    const shown = presentation(error.error);
    const parts = shown.recovery ? [shown.summary, shown.recovery] : [shown.summary];
    return { join: parts, separator: ' ' };
  }
  return message('Something went wrong: %@', errorMessage(error));
}

/** A change is never run twice, so a dead link leaves the outcome unknown. */
export function mutationFailureText(error: unknown): Text {
  if (fileBrowserFailure(error) === null) {
    return message(
      'The connection dropped before the Host answered, so the change may have happened. The folder shows what is there now.',
    );
  }
  return failureText(error);
}

export const UPLOAD_LIMIT_ERROR = () => tooLarge(FILE_LIMITS.uploadBytes);
