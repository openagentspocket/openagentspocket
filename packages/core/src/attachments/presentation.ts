import { presentation } from '../errors/presentation';
import { message, type Text } from '../errors/text';
import { TransportFailure } from '../errors/transport-error';
import {
  type AttachmentCommand,
  AttachmentError,
  type AttachmentFailure,
  type AttachmentMedium,
  type AttachmentState,
  attachmentProgressFraction,
} from './types';

/** The status bar's view of a state (Swift `ComposerStagingStore.Presentation`). */
export interface AttachmentPresentation {
  readonly icon:
    | 'photo'
    | 'doc'
    | 'arrow.up.circle'
    | 'exclamationmark.triangle'
    | 'checkmark.circle'
    | 'info.circle';
  readonly title: Text;
  readonly accessibilityLabel: Text;
  readonly commands: readonly AttachmentCommand[];
}

const byMedium = (medium: AttachmentMedium, image: string, file: string) =>
  message(medium === 'image' ? image : file);

/** The failure a thrown value means for the user. Cancellation is the caller's concern. */
export function attachmentFailure(thrown: unknown, medium: AttachmentMedium): AttachmentFailure {
  const failure = (text: Text, isRetryable: boolean): AttachmentFailure => ({
    medium,
    message: text,
    isRetryable,
  });
  if (thrown instanceof TransportFailure) {
    const error = thrown.error;
    if (error.kind === 'hostFeatureUnavailable') {
      const shown = presentation(error);
      const parts = shown.detail === undefined ? [shown.summary] : [shown.summary, shown.detail];
      return failure({ join: parts, separator: ': ' }, false);
    }
    if (error.kind === 'sshUnreachable') {
      return failure(message('The Host is not connected. Reconnect, then retry the upload.'), true);
    }
  }
  if (thrown instanceof AttachmentError) {
    switch (thrown.kind) {
      case 'sftpUnavailable':
        return failure(
          message('SFTP is unavailable on this Host. Enable its SSH SFTP subsystem.'),
          false,
        );
      case 'selectionUnavailable':
        return failure(
          byMedium(
            medium,
            'The selected photo is no longer available.',
            'The selected file is no longer available.',
          ),
          false,
        );
      case 'sourceTooLarge':
        return failure(
          byMedium(
            medium,
            'The selected image is too large to decode safely.',
            'The selected file exceeds the 64 MiB upload limit.',
          ),
          false,
        );
      case 'invalidImage':
        return failure(message('The selected item is not a readable image.'), false);
      case 'unableToProduceBoundedOutput':
        return failure(
          message('The image could not be reduced below the 16 MiB upload limit.'),
          false,
        );
      case 'localStorageFailed':
        return failure(
          byMedium(
            medium,
            "Agentico couldn't prepare the image in protected local storage.",
            "Agentico couldn't prepare the file in protected local storage.",
          ),
          false,
        );
      case 'localReadFailed':
      case 'invalidPreparedSource':
        return failure(
          byMedium(medium, 'Image preparation failed.', 'File preparation failed.'),
          false,
        );
      default:
        return failure(
          byMedium(medium, 'Image upload failed.', 'File upload failed.'),
          thrown.isRetryable,
        );
    }
  }
  return failure(byMedium(medium, 'Image preparation failed.', 'File preparation failed.'), false);
}

export function attachmentPresentation(state: AttachmentState): AttachmentPresentation | null {
  switch (state.kind) {
    case 'idle':
      return null;
    case 'preparing': {
      return {
        icon: state.medium === 'image' ? 'photo' : 'doc',
        title: byMedium(state.medium, 'Preparing Image…', 'Preparing File…'),
        accessibilityLabel: byMedium(state.medium, 'Preparing Image', 'Preparing File'),
        commands: ['cancel'],
      };
    }
    case 'uploading': {
      const percent = String(Math.floor(attachmentProgressFraction(state.progress) * 100));
      const image = state.medium === 'image';
      return {
        icon: 'arrow.up.circle',
        title: message(image ? 'Uploading Image… %lld%%' : 'Uploading File… %lld%%', percent),
        accessibilityLabel: message(
          image ? 'Uploading Image, %lld percent' : 'Uploading File, %lld percent',
          percent,
        ),
        commands: ['cancel'],
      };
    }
    case 'failed':
    case 'backgroundInterrupted':
      return {
        icon: 'exclamationmark.triangle',
        title: state.failure.message,
        accessibilityLabel: state.failure.message,
        commands: state.failure.isRetryable ? ['retry', 'dismiss'] : ['dismiss'],
      };
    case 'completed': {
      const { outcome } = state;
      const title = outcome.copied
        ? byMedium(
            outcome.medium,
            'Image path inserted and copied.',
            'File path inserted and copied.',
          )
        : byMedium(
            outcome.medium,
            "Image path inserted, but couldn't be copied.",
            "File path inserted, but couldn't be copied.",
          );
      return {
        icon: outcome.copied ? 'checkmark.circle' : 'info.circle',
        title,
        accessibilityLabel: title,
        commands: outcome.copied ? ['dismiss'] : ['copyPath', 'dismiss'],
      };
    }
  }
}
