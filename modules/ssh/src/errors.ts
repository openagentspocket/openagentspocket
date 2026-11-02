/** Every failure the SSH module reports, as a stable code callers switch on. */
export const SSH_ERROR_CODES = [
  // From the native SSH layer (libssh2 on iOS, JSch on Android).
  'invalidEndpoint',
  'connectionFailed',
  'algorithmNegotiationFailed',
  'authenticationFailed',
  'timedOut',
  'cancelled',
  'channelFailed',
  'forwardingDenied',
  'targetUnreachable',
  'streamLocalOpenFailed',
  'unexpectedEOF',
  'responseTooLarge',
  'sftpUnavailable',
  'sftpFailure',
  'connectionInvalidated',
  // Host Key policy, decided in TypeScript before authentication.
  'hostKeyMismatch',
  'hostKeyRejected',
  // Device keys.
  'keyNotFound',
  'keyCorrupt',
  'keychainFailed',
  // The bridge: an id native no longer knows, a bad argument, a local listener.
  'closed',
  'invalidArgument',
  'forwardFailed',
  'unknown',
] as const;

export type SshErrorCode = (typeof SSH_ERROR_CODES)[number];

const KNOWN = new Set<string>(SSH_ERROR_CODES);

export class SshError extends Error {
  constructor(
    readonly code: SshErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = 'SshError';
  }
}

export function isSshErrorCode(value: unknown): value is SshErrorCode {
  return typeof value === 'string' && KNOWN.has(value);
}

/** Normalizes anything a native call rejects with into an `SshError`. */
export function toSshError(error: unknown): SshError {
  if (error instanceof SshError) return error;
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : String(error);
  return new SshError(isSshErrorCode(code) ? code : 'unknown', message);
}
