import {
  asTransportError,
  CancelledError,
  type TransportError,
  TransportFailure,
} from '@openagentspocket/core';
import { SshError, type SshErrorCode, toSshError } from 'agentico-ssh';

/** The one SSH-module-to-TransportError taxonomy, at connect time and after (Swift ErrorMapping). */

function sharedClassification(code: SshErrorCode): TransportError | null {
  switch (code) {
    case 'authenticationFailed':
      return { kind: 'authenticationFailed' };
    case 'timedOut':
      return { kind: 'timedOut' };
    case 'cancelled':
      return { kind: 'cancelled' };
    case 'forwardingDenied':
      return { kind: 'tcpForwardingUnavailable' };
    case 'keyNotFound':
    case 'keyCorrupt':
      return { kind: 'deviceKeyCorrupt' };
    case 'keyInvalid':
    case 'keyEncrypted':
      return { kind: 'rsaKeyCorrupt' };
    case 'keychainFailed':
      return { kind: 'keyAccessNotConfirmed' };
    default:
      return null;
  }
}

function detailOf(error: SshError): string {
  return error.message === error.code ? error.code : `${error.code}: ${error.message}`;
}

/** Errors that are already ours (or a caller's cancellation) pass through unchanged. */
function passThrough(error: unknown): TransportError | null {
  if (error instanceof TransportFailure) return error.error;
  if (error instanceof CancelledError) return { kind: 'cancelled' };
  return null;
}

/** A failure while connecting: transport-level problems read as an unreachable server. */
export function mapConnectError(error: unknown): TransportError {
  const own = passThrough(error);
  if (own) return own;
  if (!(error instanceof SshError)) return asTransportError(toSshError(error));
  const shared = sharedClassification(error.code);
  if (shared) return shared;
  switch (error.code) {
    case 'targetUnreachable':
    case 'connectionFailed':
    case 'invalidEndpoint':
    case 'algorithmNegotiationFailed':
    case 'connectionInvalidated':
    case 'closed':
      return { kind: 'sshUnreachable', detail: detailOf(error) };
    default:
      return { kind: 'channelFailed', detail: detailOf(error) };
  }
}

/**
 * A failure after connecting. `streamLocalOpenFailed` is deliberately a plain `channelFailed`
 * here: only the socket classifier knows the path and has run `test -S`, so the path-bearing
 * case is its to produce.
 */
export function mapOperationError(error: unknown): TransportError {
  const own = passThrough(error);
  if (own) return own;
  if (!(error instanceof SshError)) return asTransportError(error);
  const shared = sharedClassification(error.code);
  if (shared) return shared;
  switch (error.code) {
    case 'unexpectedEOF':
      return {
        kind: 'malformedResponse',
        detail: 'stream-local channel closed before a response line',
      };
    case 'responseTooLarge':
      return { kind: 'malformedResponse', detail: 'response line exceeds the size limit' };
    case 'connectionInvalidated':
    case 'closed':
      return { kind: 'sshUnreachable', detail: 'The SSH connection is no longer reusable.' };
    default:
      return { kind: 'channelFailed', detail: detailOf(error) };
  }
}

/** Whether a post-connect failure means the SSH connection itself is gone. */
export function invalidatesConnection(error: unknown): boolean {
  return (
    error instanceof SshError && (error.code === 'connectionInvalidated' || error.code === 'closed')
  );
}

/** `mapOperationError` as a thrown carrier. */
export function operationFailure(error: unknown): TransportFailure {
  return error instanceof TransportFailure ? error : new TransportFailure(mapOperationError(error));
}
