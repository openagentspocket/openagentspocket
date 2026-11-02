/**
 * The steps of the pairing ceremony, in order. Failure copy is keyed per step
 * so the user knows whether to rescan, fix the network, or regenerate the
 * Pairing Code. `parse` failures never reach the ceremony client (the
 * decoder reports them), but the step exists so every failure shares one
 * taxonomy.
 */
export type PairingStep = 'parse' | 'reach' | 'authenticate' | 'enroll' | 'verify';

export const PAIRING_STEPS: readonly PairingStep[] = [
  'parse',
  'reach',
  'authenticate',
  'enroll',
  'verify',
];

/**
 * A refusal code from the Enrollment accept protocol. Unrecognized codes are
 * kept verbatim: a newer plugin may refuse for reasons this build does not
 * know, and that is still a refusal.
 */
export type EnrollmentRefusal =
  /** No pending ceremony: already used, cleaned up, or never existed. */
  | { readonly kind: 'unknownPairing' }
  /** The TTL passed; the Bootstrap Key line was removed. */
  | { readonly kind: 'expired' }
  /** The submission was not a bare Ed25519 public line. Retry is allowed. */
  | { readonly kind: 'invalidKey' }
  /** Nothing arrived on stdin. Retry is allowed. */
  | { readonly kind: 'noInput' }
  | { readonly kind: 'unrecognized'; readonly code: string };

const REFUSALS: Record<string, EnrollmentRefusal> = {
  unknown_pairing: { kind: 'unknownPairing' },
  expired: { kind: 'expired' },
  invalid_key: { kind: 'invalidKey' },
  no_input: { kind: 'noInput' },
};

export function enrollmentRefusal(wireCode: string): EnrollmentRefusal {
  return REFUSALS[wireCode] ?? { kind: 'unrecognized', code: wireCode };
}

/** Why the ceremony failed, classified per step. */
export type PairingCeremonyFailure =
  /** No candidate presented the pinned host key in time; one line per attempted address. */
  | { readonly kind: 'hostUnreachable'; readonly detail: string }
  /**
   * Tailscale SSH, not OpenSSH, answered at these addresses and no other
   * candidate completed. It never reads authorized_keys, so the Bootstrap
   * Key's forced command cannot run there. Detected before authenticating.
   */
  | { readonly kind: 'tailscaleSSH'; readonly addresses: readonly string[]; readonly port: number }
  /** The pinned Host is there but rejected the Bootstrap Key (used, expired, popup closed). */
  | { readonly kind: 'bootstrapRejected' }
  /** The Enrollment entrypoint answered, and said no. */
  | { readonly kind: 'enrollmentRefused'; readonly refusal: EnrollmentRefusal }
  /** The Bootstrap Key authenticated but the forced command ended without a response line. */
  | { readonly kind: 'enrollmentUnanswered' }
  /** The exchange broke down: wrong protocol, dead channel, or timeout. */
  | { readonly kind: 'enrollmentFailed'; readonly detail: string }
  /** The reconnect with the enrolled Device Key failed, so nothing was persisted. */
  | { readonly kind: 'verificationFailed'; readonly detail: string };

/** A classified ceremony failure, thrown by a `PairingConnector`. */
export class PairingCeremonyError extends Error {
  override readonly name = 'PairingCeremonyError';
  constructor(readonly failure: PairingCeremonyFailure) {
    super(`pairing failed: ${failure.kind}`);
  }
}

/** The ceremony was cancelled (the scan sheet went away); nobody is left to tell. */
export class PairingCancelledError extends Error {
  override readonly name = 'PairingCancelledError';
  constructor() {
    super('pairing cancelled');
  }
}

/** The Pairing step a failure is attributed to. */
export function failureStep(failure: PairingCeremonyFailure): PairingStep {
  switch (failure.kind) {
    case 'hostUnreachable':
    case 'tailscaleSSH':
      return 'reach';
    case 'bootstrapRejected':
      return 'authenticate';
    case 'enrollmentRefused':
    case 'enrollmentUnanswered':
    case 'enrollmentFailed':
      return 'enroll';
    case 'verificationFailed':
      return 'verify';
  }
}

/** What a completed ceremony proves: the facts persisted as a Host, only after the verified reconnect. */
export interface PairingResult {
  /** The candidate address the ceremony succeeded against. */
  readonly address: string;
  readonly port: number;
  readonly username: string;
  /** The fingerprint the Host actually presented (digest-equal to the pinned one). */
  readonly hostKeyFingerprint: string;
}

/**
 * One line of the Enrollment accept stdout protocol:
 * `HERDR-ENROLL:OK:<SHA256:fingerprint>` or `HERDR-ENROLL:ERR:<code>`.
 * Anything else (login-shell noise, a wrong forced command) is not a response.
 */
export type EnrollmentResponse =
  | { readonly kind: 'enrolled'; readonly fingerprint: string }
  | { readonly kind: 'refused'; readonly refusal: EnrollmentRefusal };

export function parseEnrollmentResponse(line: string): EnrollmentResponse | null {
  const ok = /^HERDR-ENROLL:OK:(SHA256:[A-Za-z0-9+/]{43})$/.exec(line);
  if (ok?.[1]) return { kind: 'enrolled', fingerprint: ok[1] };
  const refused = /^HERDR-ENROLL:ERR:([a-z_]+)$/.exec(line);
  if (refused?.[1]) return { kind: 'refused', refusal: enrollmentRefusal(refused[1]) };
  return null;
}

/**
 * Whether a server identification string is Tailscale SSH's
 * (`SSH-2.0-Tailscale…`): the software version is compared up to its first
 * space, so a comment or a version suffix still matches.
 */
export function isTailscaleSSH(serverIdentification: string | null | undefined): boolean {
  const prefix = 'SSH-2.0-';
  if (!serverIdentification?.startsWith(prefix)) return false;
  const softwareVersion = serverIdentification.slice(prefix.length).split(' ')[0] ?? '';
  return softwareVersion.startsWith('Tailscale');
}
