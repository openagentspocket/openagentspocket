import {
  type CancelSignal,
  fingerprintDisplay,
  type HostKeyFailure,
  type HostKeyFingerprint,
  type HostKeyPolicy,
  type HostKeyTrust,
  type HostKeyVerificationGate,
  type TransportError,
  verifyHostKey,
} from '@openagentspocket/core';
import { fromBase64, type HostKey } from 'agentico-ssh';

/** `SHA256:<base64 without padding>` as the SSH module reports it, back to a digest. */
export function fingerprintFromHostKey(key: HostKey): HostKeyFingerprint | null {
  const match = /^SHA256:([A-Za-z0-9+/]+)$/.exec(key.fingerprint);
  const encoded = match?.[1];
  if (!encoded) return null;
  const digest = fromBase64(encoded + '='.repeat((4 - (encoded.length % 4)) % 4));
  return digest.length === 32 ? { digest, algorithm: key.algorithm } : null;
}

/** A host-key refusal as the transport error the app and preflight classify against. */
export function hostKeyFailureError(failure: HostKeyFailure): TransportError {
  return failure.kind === 'hostKeyMismatch'
    ? {
        kind: 'hostKeyMismatch',
        known: fingerprintDisplay(failure.known),
        presented: fingerprintDisplay(failure.presented),
      }
    : {
        kind: 'hostKeyRejected',
        presented: fingerprintDisplay(failure.presented),
        ...(failure.unanswered ? { unanswered: true } : {}),
      };
}

export interface HostKeyDecision {
  /** The policy's refusal, if any, to report instead of the module's generic rejection. */
  failure: TransportError | null;
}

export interface HostKeyCheckOptions {
  readonly host: string;
  readonly port: number;
  readonly trust: HostKeyTrust;
  readonly policy: HostKeyPolicy;
  readonly gate: HostKeyVerificationGate;
  readonly signal?: CancelSignal;
}

/**
 * Applies the TOFU rules from core to the key a server presented, under the connect's gate so
 * routes never prompt at once. Returns the failure to report, or null to let authentication
 * start. The module's own pin is never used: core owns the policy (per-algorithm fingerprints,
 * Host-keyed trust).
 */
export async function checkPresentedHostKey(
  options: HostKeyCheckOptions,
  key: HostKey,
): Promise<TransportError | null> {
  const presented = fingerprintFromHostKey(key);
  if (!presented) return { kind: 'channelFailed', detail: 'unreadable host key fingerprint' };
  const failure = await options.gate.withLock(
    () =>
      verifyHostKey({
        host: options.host,
        port: options.port,
        trust: options.trust,
        policy: options.policy,
        presented,
      }),
    options.signal,
  );
  return failure ? hostKeyFailureError(failure) : null;
}
