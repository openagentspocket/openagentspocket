import {
  type HostKeyFingerprint,
  sameFingerprint,
  UNKNOWN_HOST_KEY_ALGORITHM,
} from './fingerprint';
import type { KnownHostsStore } from './known-hosts';

/** Where a hop's trusted fingerprints live in the known-hosts store. */
export type HostKeyTrust =
  /** By the endpoint dialled, as OpenSSH's known_hosts: Jump Hosts, ad-hoc connections. */
  | { readonly kind: 'endpoint' }
  /**
   * By a catalog Host, so every route reaching it must present the same key; a
   * route's LAN address answered by another machine is refused before auth.
   */
  | { readonly kind: 'host'; readonly hostId: string };

/** The store key of a catalog Host's trust. Port 0 never names a real endpoint. */
export function hostTrustKey(hostId: string): { host: string; port: number } {
  return { host: `agentico-host:${hostId.toLowerCase()}`, port: 0 };
}

export function trustStorageKey(
  trust: HostKeyTrust,
  host: string,
  port: number,
): { host: string; port: number } {
  return trust.kind === 'endpoint' ? { host, port } : hostTrustKey(trust.hostId);
}

/** An unknown host key awaiting the user's trust decision on first connect. */
export interface HostKeyCandidate {
  /** The endpoint dialled, as the prompt names it. */
  readonly host: string;
  readonly port: number;
  readonly fingerprint: HostKeyFingerprint;
}

/** TOFU: trust what the user confirmed on first connect, hard-fail when it changes. */
export interface HostKeyPolicy {
  readonly knownHosts: KnownHostsStore;
  /** Shown the candidate; false fails with `hostKeyRejected` and stores nothing. */
  confirmFirstConnect(candidate: HostKeyCandidate): Promise<boolean>;
}

/** Why a presented host key was refused; shaped like the transport error cases. */
export type HostKeyFailure =
  | {
      readonly kind: 'hostKeyMismatch';
      readonly known: HostKeyFingerprint;
      readonly presented: HostKeyFingerprint;
    }
  | { readonly kind: 'hostKeyRejected'; readonly presented: HostKeyFingerprint };

export interface HostKeyCheck {
  /** The endpoint dialled. */
  readonly host: string;
  readonly port: number;
  readonly trust?: HostKeyTrust;
  readonly policy: HostKeyPolicy;
  /** The key the server presented (`fingerprintFromBlob` over its wire-format blob). */
  readonly presented: HostKeyFingerprint;
}

/**
 * Copies the endpoint's fingerprints to the Host's key while the Host has none
 * of its own, so a key trusted per endpoint is never asked for again.
 */
function adoptEndpointTrust(check: HostKeyCheck, key: { host: string; port: number }): void {
  const { knownHosts } = check.policy;
  if (knownHosts.fingerprints(key.host, key.port).length > 0) return;
  for (const fingerprint of knownHosts.fingerprints(check.host, check.port)) {
    knownHosts.setFingerprint(fingerprint, key.host, key.port);
  }
}

/**
 * Applies the TOFU policy to the key a server presented. Resolves null when
 * authentication may proceed. A changed key, or a trusted machine presenting
 * another algorithm, is a mismatch without any prompt; an unknown key is
 * stored only once the user confirms it, before authentication, so bad
 * credentials never cause a second prompt.
 */
export async function verifyHostKey(check: HostKeyCheck): Promise<HostKeyFailure | null> {
  const trust = check.trust ?? { kind: 'endpoint' };
  const key = trustStorageKey(trust, check.host, check.port);
  const { knownHosts } = check.policy;
  if (trust.kind !== 'endpoint') adoptEndpointTrust(check, key);
  const { presented } = check;
  const known = knownHosts.fingerprintFor(key.host, key.port, presented.algorithm);
  if (known) {
    if (!sameFingerprint(known, presented)) return { kind: 'hostKeyMismatch', known, presented };
    if (known.algorithm === UNKNOWN_HOST_KEY_ALGORITHM) {
      // Matching a digest stored without an algorithm proves its algorithm.
      knownHosts.setFingerprint(presented, key.host, key.port);
    }
    return null;
  }
  const previouslyTrusted = knownHosts.fingerprint(key.host, key.port);
  if (previouslyTrusted) {
    // Its trusted algorithm left negotiation: a security change, not a first connect.
    return { kind: 'hostKeyMismatch', known: previouslyTrusted, presented };
  }
  const confirmed = await check.policy.confirmFirstConnect({
    host: check.host,
    port: check.port,
    fingerprint: presented,
  });
  if (!confirmed) return { kind: 'hostKeyRejected', presented };
  knownHosts.setFingerprint(presented, key.host, key.port);
  return null;
}
