import type { EnrollmentRefusal, PairingCeremonyFailure, PairingStep } from './ceremony';
import type { PairingCodeError } from './code';

/**
 * Every pairing message the UI shows, by stable id. Copy is not here: the
 * app resolves `PAIRING_MESSAGE_CATALOG_KEYS[id]` (the Swift catalog's source
 * key, `%@` for each argument in order) through the i18n catalogs.
 */
export type PairingMessageId =
  | 'scanNotAPairingCode'
  | 'scanUnsupportedVersion'
  | 'scanUnreadable'
  | 'codeExpired'
  | 'deviceKeyLocked'
  | 'deviceKeyUnavailable'
  | 'hostUnreachable'
  | 'tailscaleSSH'
  | 'bootstrapRejected'
  | 'unknownPairing'
  | 'invalidKey'
  | 'noInput'
  | 'refusalUnrecognized'
  | 'enrollmentUnanswered'
  | 'enrollmentFailed'
  | 'notAuthorized'
  | 'enrolledNotVerified'
  | 'saveFailed'
  | 'unexpected';

export interface PairingMessage {
  readonly id: PairingMessageId;
  /** Format arguments, in the catalog key's `%@` order. */
  readonly args: readonly string[];
}

/**
 * User-facing outcome of a failed attempt, classified per step so the copy
 * says whether to rescan, fix the network, or regenerate the code.
 */
export interface PairingFailure {
  /** `parse` marks failures caught before any connection (expired code, unloadable key). */
  readonly step: PairingStep;
  readonly message: PairingMessage;
  /** Whether trying again with the same scanned code (inside its TTL) can succeed. */
  readonly canRetry: boolean;
}

const message = (id: PairingMessageId, ...args: string[]): PairingMessage => ({ id, args });

const failure = (
  step: PairingStep,
  id: PairingMessageId,
  canRetry: boolean,
  ...args: string[]
): PairingFailure => ({ step, message: message(id, ...args), canRetry });

/** The message for a scanned string that did not decode. */
export function scanFailureMessage(error: PairingCodeError): PairingMessage {
  switch (error.code) {
    case 'bad_prefix':
      return message('scanNotAPairingCode');
    case 'unsupported_version':
      return message('scanUnsupportedVersion', error.found);
    case 'bad_encoding':
    case 'bad_payload':
      return message('scanUnreadable');
  }
}

export const expiredCodeFailure = (): PairingFailure => failure('parse', 'codeExpired', false);
export const deviceKeyLockedFailure = (): PairingFailure =>
  failure('parse', 'deviceKeyLocked', true);
export const deviceKeyUnavailableFailure = (): PairingFailure =>
  failure('parse', 'deviceKeyUnavailable', false);
export const saveFailedFailure = (): PairingFailure => failure('verify', 'saveFailed', false);
export const unexpectedFailure = (detail: string): PairingFailure =>
  failure('reach', 'unexpected', true, detail);

/**
 * The failure copy for a ceremony failure. `isConfigOnly` (no Bootstrap Key
 * was ever offered) turns a verify failure into "authorize it yourself"; after
 * Enrollment it stays "enrolled, finish with a retry".
 */
export function ceremonyFailure(
  error: PairingCeremonyFailure,
  isConfigOnly: boolean,
): PairingFailure {
  switch (error.kind) {
    case 'hostUnreachable':
      return failure('reach', 'hostUnreachable', true);
    case 'tailscaleSSH':
      return failure(
        'reach',
        'tailscaleSSH',
        false,
        String(error.port),
        error.addresses.join(', '),
      );
    case 'bootstrapRejected':
      return failure('authenticate', 'bootstrapRejected', false);
    case 'enrollmentRefused':
      return refusalFailure(error.refusal);
    case 'enrollmentUnanswered':
      return failure('enroll', 'enrollmentUnanswered', false);
    case 'enrollmentFailed':
      return failure('enroll', 'enrollmentFailed', true);
    case 'verificationFailed':
      return isConfigOnly
        ? failure('verify', 'notAuthorized', false)
        : failure('verify', 'enrolledNotVerified', true);
  }
}

function refusalFailure(refusal: EnrollmentRefusal): PairingFailure {
  switch (refusal.kind) {
    case 'expired':
      return failure('enroll', 'codeExpired', false);
    case 'unknownPairing':
      return failure('enroll', 'unknownPairing', false);
    case 'invalidKey':
      return failure('enroll', 'invalidKey', true);
    case 'noInput':
      return failure('enroll', 'noInput', true);
    case 'unrecognized':
      return failure('enroll', 'refusalUnrecognized', false, refusal.code);
  }
}

/** The Swift string catalog's source keys, so the converted en/es catalogs resolve each id. */
export const PAIRING_MESSAGE_CATALOG_KEYS: Readonly<Record<PairingMessageId, string>> = {
  scanNotAPairingCode: 'That QR code is not a herdr Pairing Code.',
  scanUnsupportedVersion:
    'This Pairing Code uses version %@, which this app does not understand. Update Agentico, then scan it again.',
  scanUnreadable: 'The Pairing Code could not be read. Regenerate it in herdr and scan again.',
  codeExpired: 'This Pairing Code has expired. Generate a new one on the computer and scan it.',
  deviceKeyLocked:
    "Pairing uses this device's SSH key, which stayed locked. Try again and confirm it's you.",
  deviceKeyUnavailable:
    "This device's Device Key could not be loaded. Open the manual Add Host form to inspect or replace it.",
  hostUnreachable:
    'The Host did not answer at any of its addresses. Check that this device is on the same network or VPN as the computer, then try again with the same code.',
  tailscaleSSH:
    "Tailscale SSH answers port %@ at %@, not OpenSSH, so this device cannot be enrolled there. On the computer, set ssh_port in the pairing plugin's pair.json to a port OpenSSH listens on, then generate a new Pairing Code.",
  bootstrapRejected:
    'The Host rejected this Pairing Code. It may have been used already, expired, or its popup was closed. Generate a new Pairing Code on the computer and scan it.',
  unknownPairing:
    'The Host has no pairing in progress for this code. Generate a new Pairing Code on the computer and scan it.',
  invalidKey:
    "The Host did not accept this device's key. Try again; if it keeps failing, update the app and the pairing plugin so they match.",
  noInput: "This device's key never reached the Host. Try again with the same code.",
  refusalUnrecognized:
    'The Host refused Enrollment (%@). Update the app and the pairing plugin so they match, then generate a new Pairing Code.',
  enrollmentUnanswered:
    'The Host accepted this Pairing Code, but its pairing command ended without answering. Check that the pairing plugin is installed and that OpenSSH, not another SSH server, answers this port, then generate a new Pairing Code.',
  enrollmentFailed:
    'Enrollment did not complete, likely a network hiccup. Try again with the same code.',
  notAuthorized:
    "The Host did not accept the Device Key, so it is not authorized there yet. Add this device's authorized_keys line on the Host, or generate a Pairing Code in herdr instead.",
  enrolledNotVerified:
    'This device was enrolled, but the verifying reconnect did not get through. Try again to finish with the enrolled key.',
  saveFailed:
    'Pairing succeeded, but the Host could not be saved because the Host catalog on this device is unreadable. Resolve that first, then pair again with a fresh code.',
  unexpected: 'Pairing failed unexpectedly. Try again with the same code. (%@)',
};
