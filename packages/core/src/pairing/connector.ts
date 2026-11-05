import { errorMessage } from '../errors/message';
import {
  PairingCancelledError,
  PairingCeremonyError,
  type PairingCeremonyFailure,
  type PairingResult,
  type PairingStep,
} from './ceremony';
import type { PairingCode } from './code';

/** This device's key as the ceremony needs it. The private half never leaves native storage. */
export interface PairingDeviceKey {
  /** The OpenSSH authorized_keys line of the public key, with this comment. */
  authorizedKeysLine(comment: string): string;
  /** OpenSSH `SHA256:` fingerprint of the public key blob. */
  readonly fingerprint: string;
}

/** The key one authentication attempt offers. */
export type PairingIdentity =
  /** The Bootstrap Key derived from the code's 32-byte Ed25519 seed; in memory only. */
  | { readonly kind: 'bootstrap'; readonly seed: Uint8Array }
  | { readonly kind: 'device'; readonly key: PairingDeviceKey };

/** SSH failures the ceremony classifies; anything else is `other`. */
export type PairingSSHFailureKind =
  | 'authenticationFailed'
  | 'timedOut'
  | 'unexpectedEOF'
  | 'cancelled'
  | 'other';

/** What a `PairingSSHConnection` adapter throws so the ceremony can classify it. */
export class PairingSSHError extends Error {
  override readonly name = 'PairingSSHError';
  constructor(
    readonly kind: PairingSSHFailureKind,
    message: string = kind,
  ) {
    super(message);
  }
}

/** The SSH operations the ceremony performs on one connection: the seam over the SSH module. */
export interface PairingSSHConnection {
  /** OpenSSH `SHA256:` fingerprint of the host key the server presented. */
  readonly hostKeyFingerprint: string;
  /** The server's identification string (`SSH-2.0-…`), when known. */
  readonly serverIdentification: string | null;
  authenticate(username: string, identity: PairingIdentity, timeoutMs: number): Promise<void>;
  /**
   * Runs `command`, writes `input` to its stdin, and resolves with stdout up
   * to and including the first newline. Rejects with `unexpectedEOF` when the
   * channel ends before any newline, `timedOut` past the deadline, and
   * `other` when the line exceeds `maximumResponseBytes`.
   */
  executeResponseLine(
    command: string,
    input: Uint8Array,
    maximumResponseBytes: number,
    timeoutMs: number,
  ): Promise<Uint8Array>;
  close(timeoutMs: number): Promise<void>;
}

/** Opens the SSH connection to one candidate (TCP + handshake, no auth) within a timeout. */
export type PairingDial = (
  endpoint: { readonly host: string; readonly port: number },
  timeoutMs: number,
) => Promise<PairingSSHConnection>;

/** Something with an `aborted` flag, such as an AbortSignal. */
export interface PairingCancellation {
  readonly aborted: boolean;
}

/**
 * Runs the ceremony for a decoded Pairing Code: reach a candidate presenting
 * the pinned host key, authenticate with the Bootstrap Key, enroll the Device
 * Key, then reconnect with the Device Key to prove it took effect. Throws
 * `PairingCeremonyError` classified per step, or `PairingCancelledError`.
 * `onStep` fires as each step begins; `parse` never appears.
 */
export interface PairingConnector {
  pair(
    code: PairingCode,
    deviceKey: PairingDeviceKey,
    onStep: (step: PairingStep) => void,
    cancellation?: PairingCancellation,
  ): Promise<PairingResult>;
}

export interface SSHPairingConnectorOptions {
  dial: PairingDial;
  /** TCP establishment and SSH handshake budget per candidate address. */
  perAddressTimeoutMs?: number;
  /** Deadline for the whole Enrollment forced-command exchange. */
  enrollTimeoutMs?: number;
  /** Comment on the submitted Device Key line. */
  deviceKeyComment?: string;
  /** Recognizes Tailscale SSH; injectable only so an e2e suite can stand OpenSSH in for it. */
  identifiesTailscaleSSH?: (serverIdentification: string | null) => boolean;
}

export const ENROLLMENT_COMMAND = 'agentico-enroll';
export const MAXIMUM_ENROLLMENT_LINE_BYTES = 4096;
export const AUTHENTICATION_TIMEOUT_MS = 10_000;
export const CLEANUP_TIMEOUT_MS = 2_000;

export const fail = (failure: PairingCeremonyFailure) => new PairingCeremonyError(failure);

export function describeError(error: unknown): string {
  return errorMessage(error);
}

export function isCancellation(error: unknown): boolean {
  return (
    error instanceof PairingCancelledError ||
    (error instanceof PairingSSHError && error.kind === 'cancelled')
  );
}

export function isAuthenticationFailure(error: unknown): boolean {
  return error instanceof PairingSSHError && error.kind === 'authenticationFailed';
}

export function checkCancellation(cancellation: PairingCancellation | undefined): void {
  if (cancellation?.aborted) throw new PairingCancelledError();
}

export async function closeQuietly(connection: PairingSSHConnection): Promise<void> {
  try {
    await connection.close(CLEANUP_TIMEOUT_MS);
  } catch {
    // Cleanup is best effort.
  }
}
