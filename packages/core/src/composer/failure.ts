import { HerdrApiError } from '../errors/herdr-api-error';
import { presentation, presentationMessage } from '../errors/presentation';
import { message, type Text } from '../errors/text';
import { asTransportError, TransportFailure } from '../errors/transport-error';
import { type ComposerRefusal, refusalText } from './policy';

/** Whether herdr (directly or carried by a transport failure) rejected the call with this code. */
export function isApiCode(error: unknown, code: string): boolean {
  if (error instanceof HerdrApiError) return error.code === code;
  if (error instanceof TransportFailure) {
    return error.error.kind === 'apiRejected' && error.error.code === code;
  }
  return false;
}

/** What a failed message says: the catalog sentence for the common cases, the error's own words otherwise. */
export function deliveryFailureText(error: unknown): Text {
  if (error instanceof TransportFailure || error instanceof HerdrApiError) {
    const shown = asTransportError(error);
    switch (shown.kind) {
      case 'sshUnreachable':
        return message('The Host is not connected. Check the connection and retry.');
      case 'timedOut':
        return message('The Host did not answer. Check the connection and retry.');
      case 'apiRejected':
        return message('herdr rejected the message: %@', shown.message);
      default:
        return presentationMessage(presentation(shown));
    }
  }
  return message('The message could not be sent. Check the connection and retry.');
}

/** A refusal as the failure line of a message that was already echoed. */
export function refusalFailureText(refusal: ComposerRefusal): Text {
  const text = refusalText(refusal);
  return 'key' in text ? message(text.key) : text.plain;
}
