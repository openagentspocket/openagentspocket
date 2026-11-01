import { decodeBase64Url, utf8Decode } from './bytes';
import { type HerdrEndpoint, herdrEndpoint, MAXIMUM_SOCKET_PATH_UTF8_LENGTH } from './endpoint';
import { canonicalFingerprint } from './fingerprint';

/**
 * A parsed Pairing Code: the versioned payload the pairing plugin renders as
 * a QR image. Wire format `HERDR-PAIR:<version>:<base64url(JSON), unpadded>`.
 * Version 1 carries the SSH coordinates and an optional Bootstrap Key;
 * version 2 adds a required Herdr Endpoint (`sock`, `herdr`). Unknown payload
 * fields are ignored. The shared vectors in `packages/plugin/test-vectors`
 * are the single source of truth.
 */
export interface PairingCode {
  /** Candidate addresses in the order to try them; IPv6 literals without brackets or zone. */
  readonly addresses: readonly string[];
  /** SSH port, 1..65535. */
  readonly port: number;
  readonly username: string;
  /** The Host's pinned host key, canonical OpenSSH `SHA256:<43 chars>`. */
  readonly hostKeyFingerprint: string;
  /** The Bootstrap Key material; null on a config-only code. */
  readonly bootstrap: PairingBootstrap | null;
  /** Required by version 2, never read from version 1. */
  readonly endpoint: HerdrEndpoint | null;
}

/** The single-use Enrollment credential. Lives in memory only, never in secure storage. */
export interface PairingBootstrap {
  /** Raw 32-byte Ed25519 seed of the Bootstrap Key. */
  readonly seed: Uint8Array;
  /** Unix seconds when the Host deletes the Bootstrap Key's authorized_keys line. */
  readonly expiresAt: number;
}

/** Why a scanned string is not a Pairing Code; `code` is the shared vectors' error id. */
export type PairingCodeError =
  | { readonly code: 'bad_prefix' }
  | { readonly code: 'unsupported_version'; readonly found: string }
  | { readonly code: 'bad_encoding' }
  | { readonly code: 'bad_payload'; readonly reason: string };

export type PairingCodeDecoding =
  | { readonly ok: true; readonly code: PairingCode }
  | { readonly ok: false; readonly error: PairingCodeError };

export const PAIRING_CODE_PREFIX = 'HERDR-PAIR';
const VERSION = '1';
const ENDPOINT_VERSION = '2';
const BOOTSTRAP_SEED_BYTES = 32;

class DecodeFailure {
  constructor(readonly error: PairingCodeError) {}
}

const badPayload = (reason: string) => new DecodeFailure({ code: 'bad_payload', reason });

/** Decodes and validates a scanned Pairing Code string. Never throws. */
export function decodePairingCode(scanned: string): PairingCodeDecoding {
  try {
    return { ok: true, code: decodeOrThrow(scanned) };
  } catch (failure) {
    if (failure instanceof DecodeFailure) return { ok: false, error: failure.error };
    throw failure;
  }
}

function decodeOrThrow(scanned: string): PairingCode {
  const head = `${PAIRING_CODE_PREFIX}:`;
  if (!scanned.startsWith(head)) throw new DecodeFailure({ code: 'bad_prefix' });
  const rest = scanned.slice(head.length);
  const separator = rest.indexOf(':');
  if (separator < 0) throw new DecodeFailure({ code: 'bad_prefix' });
  const found = rest.slice(0, separator);
  const wire = decodedPayload(rest.slice(separator + 1));
  if (found === VERSION) return validated(wire);
  if (found !== ENDPOINT_VERSION) {
    throw new DecodeFailure({ code: 'unsupported_version', found });
  }
  // Version 2: the v1 fields first, with the same rules and reasons, then the endpoint.
  const sock = optional(wire, 'sock', 'string');
  const herdr = optional(wire, 'herdr', 'string');
  const code = validated(wire);
  if (sock === undefined) throw badPayload('sock is required in a version 2 Pairing Code');
  if (herdr === undefined) throw badPayload('herdr is required in a version 2 Pairing Code');
  const endpoint = herdrEndpoint(sock, herdr);
  if (endpoint === null) {
    throw badPayload(
      'sock and herdr must be absolute paths without quotes, backslashes, or control ' +
        `characters, and sock a herdr socket path of at most ${MAXIMUM_SOCKET_PATH_UTF8_LENGTH} bytes`,
    );
  }
  return { ...code, endpoint };
}

type Wire = Record<string, unknown>;

/** The base64url JSON body every envelope version shares. */
function decodedPayload(encodedBody: string): Wire {
  const bytes = decodeBase64Url(encodedBody);
  const text = bytes === null ? null : utf8Decode(bytes, true);
  if (text === null) throw new DecodeFailure({ code: 'bad_encoding' });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DecodeFailure({ code: 'bad_encoding' });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw badPayload('payload shape mismatch');
  }
  return parsed as Wire;
}

/**
 * A field that may be absent or null; any other wrong type is a shape
 * mismatch (the Swift decoder's lenient optional fields).
 */
function optional(wire: Wire, key: string, type: 'string'): string | undefined;
function optional(wire: Wire, key: string, type: 'number'): number | undefined;
function optional(wire: Wire, key: string, type: 'string' | 'number'): string | number | undefined {
  const value = wire[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== type) throw badPayload('payload shape mismatch');
  return value as string | number;
}

function optionalStrings(wire: Wire, key: string): string[] | undefined {
  const value = wire[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw badPayload('payload shape mismatch');
  }
  return value as string[];
}

function validated(wire: Wire): PairingCode {
  const addrs = optionalStrings(wire, 'addrs');
  const portValue = optional(wire, 'port', 'number');
  const user = optional(wire, 'user', 'string');
  const fp = optional(wire, 'fp', 'string');
  const seed = optional(wire, 'seed', 'string');
  const exp = optional(wire, 'exp', 'number');

  if (addrs === undefined || addrs.length === 0) {
    throw badPayload('addresses must be a non-empty array');
  }
  for (const address of addrs) {
    if (address === '' || containsWhitespace(address)) {
      throw badPayload(`invalid address: ${address}`);
    }
  }
  if (
    portValue === undefined ||
    !Number.isInteger(portValue) ||
    portValue < 1 ||
    portValue > 65535
  ) {
    throw badPayload('port must be an integer in 1..65535');
  }
  if (user === undefined || user === '' || containsWhitespace(user)) {
    throw badPayload('username must be a non-empty string without whitespace');
  }
  const fingerprint = canonicalFingerprint(fp);
  if (fingerprint === null) throw badPayload('fp must be an OpenSSH SHA256 fingerprint');

  return {
    addresses: addrs,
    port: portValue,
    username: user,
    hostKeyFingerprint: fingerprint,
    bootstrap: validatedBootstrap(seed, exp),
    endpoint: null,
  };
}

function validatedBootstrap(
  seed: string | undefined,
  exp: number | undefined,
): PairingBootstrap | null {
  if (seed === undefined && exp === undefined) return null;
  if (seed === undefined || exp === undefined) {
    throw badPayload('seed and exp must be present together');
  }
  const seedBytes = decodeBase64Url(seed);
  if (seedBytes === null || seedBytes.length !== BOOTSTRAP_SEED_BYTES) {
    throw badPayload(`seed must be ${BOOTSTRAP_SEED_BYTES} bytes of base64url`);
  }
  if (!Number.isSafeInteger(exp) || exp <= 0) {
    throw badPayload('exp must be a positive unix-seconds integer');
  }
  return { seed: seedBytes, expiresAt: exp };
}

/** Unicode whitespace and newlines (General Category Z, U+0009..U+000D, U+0085). */
function containsWhitespace(text: string): boolean {
  return /[\p{Z}\t\n\v\f\r\u0085]/u.test(text);
}

/** Whether pairing waits for a Pair tap: a launcher code without a Bootstrap Key. */
export function needsConfirmation(code: PairingCode): boolean {
  return code.endpoint !== null && code.bootstrap === null;
}

/** The same coordinates and endpoint without the Bootstrap Key: a retry after Enrollment landed. */
export function withoutBootstrap(code: PairingCode): PairingCode {
  return { ...code, bootstrap: null };
}
