import { isRouteHostKeySecurityFailure, type RouteFailure } from '../hosts/ssh-route';
import { HerdrApiError } from './herdr-api-error';
import type { Text } from './text';

/**
 * Transport-level failures: a closed taxonomy so every screen maps errors to user guidance
 * consistently instead of string-matching. Plain data (equatable, storable in state); thrown
 * wrapped in a `TransportFailure`.
 *
 * Host key fingerprints are the display strings the SSH module reports (`SHA256:...`).
 * Embedded overlay networks are gone (ADR 0004), so the Swift `overlayFailed` case is too.
 */
export type TransportError =
  /** The SSH server could not be reached: refused, no route, or died before authentication. */
  | { readonly kind: 'sshUnreachable'; readonly detail: string }
  /** The Jump Host in front of the Host failed; carries that first hop's own failure. */
  | { readonly kind: 'jumpHostFailed'; readonly underlying: TransportError }
  /** Every one of the Host's routes failed, each with its own failure. */
  | { readonly kind: 'noRouteReached'; readonly failures: readonly TransportRouteFailure[] }
  /** The Jump Host's policy prohibits the direct-tcpip channel needed to reach the Host. */
  | { readonly kind: 'tcpForwardingUnavailable' }
  | { readonly kind: 'authenticationFailed' }
  /** The stored Ed25519 Device Key cannot be decoded; only replacing it helps. */
  | { readonly kind: 'deviceKeyCorrupt' }
  /** The stored RSA identity cannot be decoded; only replacing it helps. */
  | { readonly kind: 'rsaKeyCorrupt' }
  /** The Host offered no RSA-SHA2-512 signature; nothing was sent. */
  | { readonly kind: 'rsaSignatureUnsupported' }
  /** The owner cancelled or failed the prompt that guards SSH key use; only Retry asks again. */
  | { readonly kind: 'keyAccessNotConfirmed' }
  /** First connect and the user declined the host key; nothing was stored. */
  | { readonly kind: 'hostKeyRejected'; readonly presented: string }
  /** The Host presented a key that differs from the trusted one: possibly a man-in-the-middle. */
  | { readonly kind: 'hostKeyMismatch'; readonly known: string; readonly presented: string }
  /** The herdr API socket path does not exist on the Host. */
  | { readonly kind: 'socketNotFound'; readonly path: string }
  /** The herdr CLI is not on the SSH session's PATH nor in the well-known prefixes. */
  | { readonly kind: 'herdrBinaryNotFound' }
  /** A paired herdr endpoint's launcher exited 126/127: missing, not executable, cannot start. */
  | { readonly kind: 'herdrLauncherNotFound'; readonly path: string }
  /** herdr is stopped or stream-local forwarding is disabled; the two cannot be told apart. */
  | { readonly kind: 'streamLocalOpenFailed'; readonly path: string }
  | {
      readonly kind: 'protocolVersionMismatch';
      readonly server: number;
      readonly supported: number;
    }
  | { readonly kind: 'homeDirectoryUnresolvable'; readonly detail: string }
  /** A directory path that cannot be passed to the login shell; rejected before any channel. */
  | { readonly kind: 'invalidDirectoryPath'; readonly path: string }
  /** Each Host keeps exactly one events channel. */
  | { readonly kind: 'eventsChannelAlreadyOpen' }
  /** Each Host keeps exactly one interactive terminal surface. */
  | { readonly kind: 'terminalChannelAlreadyOpen' }
  /** The request exceeded its deadline; the channel it held was closed. */
  | { readonly kind: 'timedOut' }
  /** A Changes script exceeded its own deadline; says nothing about link health. */
  | { readonly kind: 'gitTimedOut' }
  /** A Chat transcript operation exceeded its own deadline; says nothing about link health. */
  | { readonly kind: 'hostFileTimedOut' }
  /** The Host refused a Chat transcript read with an SFTP status other than "no such file". */
  | { readonly kind: 'hostFileUnreadable'; readonly status: number }
  /** OpenCode's database failed a Chat query; `detail` is one sentence for the user. */
  | { readonly kind: 'hostStoreUnreadable'; readonly detail: string }
  | { readonly kind: 'cancelled' }
  /** The channel produced bytes that do not decode as a herdr response. */
  | { readonly kind: 'malformedResponse'; readonly detail: Text }
  /** herdr answered with an error envelope. */
  | { readonly kind: 'apiRejected'; readonly code: string; readonly message: string }
  /** The channel failed outside the known shapes; carries the underlying description. */
  | { readonly kind: 'channelFailed'; readonly detail: string }
  /** The remote attach command exited nonzero; `output` is herdr's last line, when there was one. */
  | { readonly kind: 'attachExited'; readonly status: number; readonly output?: string }
  | { readonly kind: 'hostFeatureUnavailable'; readonly feature: string };

export type TransportErrorKind = TransportError['kind'];

/** One route's failure in a `noRouteReached`: the hosts module's route failure over a `TransportError`. */
export type TransportRouteFailure = RouteFailure<TransportError>;

/** The thrown carrier of a `TransportError`. */
export class TransportFailure extends Error {
  override readonly name = 'TransportFailure';

  constructor(readonly error: TransportError) {
    super(`TransportError.${error.kind}`);
  }
}

type Leaf = Exclude<TransportErrorKind, 'jumpHostFailed' | 'noRouteReached'>;

/**
 * Whether reconnecting without the user can plausibly recover. Configuration, trust,
 * authentication and protocol failures stop so the UI can explain the required action.
 * `streamLocalOpenFailed` is configuration-class: neither of its causes (a stopped herdr,
 * disabled stream-local forwarding) clears without the user acting on the Host. A rejection is
 * retryable because herdr's error codes are open-ended and most describe a target that moved.
 */
const RETRYABLE: Readonly<Record<Leaf, boolean>> = {
  sshUnreachable: true,
  timedOut: true,
  cancelled: true,
  channelFailed: true,
  attachExited: true,
  apiRejected: true,
  authenticationFailed: false,
  tcpForwardingUnavailable: false,
  deviceKeyCorrupt: false,
  rsaKeyCorrupt: false,
  rsaSignatureUnsupported: false,
  keyAccessNotConfirmed: false,
  hostKeyRejected: false,
  hostKeyMismatch: false,
  socketNotFound: false,
  herdrBinaryNotFound: false,
  herdrLauncherNotFound: false,
  protocolVersionMismatch: false,
  streamLocalOpenFailed: false,
  gitTimedOut: false,
  hostFileTimedOut: false,
  hostFileUnreadable: false,
  hostStoreUnreadable: false,
  hostFeatureUnavailable: false,
  homeDirectoryUnresolvable: false,
  invalidDirectoryPath: false,
  eventsChannelAlreadyOpen: false,
  terminalChannelAlreadyOpen: false,
  malformedResponse: false,
};

/** The single retry decision. */
export function isRetryable(error: TransportError): boolean {
  switch (error.kind) {
    // A Jump Host is retryable exactly when the failure behind it is.
    case 'jumpHostFailed':
      return isRetryable(error.underlying);
    // Any route that may come back is worth another race, unless a changed key on a route that
    // cannot name another machine stops it, as it stops a single route.
    case 'noRouteReached':
      return (
        !error.failures.some(isTransportRouteHostKeySecurityFailure) &&
        error.failures.some((failure) => isRetryable(failure.error))
      );
    default:
      return RETRYABLE[error.kind];
  }
}

/**
 * A changed host key is a security refusal, not an ordinary outage. A Jump Host key change is
 * still one. Across routes, a LAN route's changed key counts only when every route failed on its
 * key; any other route's changed key counts on its own.
 */
export function isHostKeySecurityFailure(error: TransportError): boolean {
  switch (error.kind) {
    case 'hostKeyMismatch':
      return true;
    case 'jumpHostFailed':
      return isHostKeySecurityFailure(error.underlying);
    case 'noRouteReached':
      return (
        (error.failures.length > 0 &&
          error.failures.every((failure) => isHostKeySecurityFailure(failure.error))) ||
        error.failures.some(isTransportRouteHostKeySecurityFailure)
      );
    default:
      return false;
  }
}

/** A changed key on a route whose address names the same machine wherever the device is. */
export function isTransportRouteHostKeySecurityFailure(failure: TransportRouteFailure): boolean {
  return isRouteHostKeySecurityFailure(failure, isHostKeySecurityFailure);
}

/**
 * Any thrown value as a `TransportError`: a carried one as is, herdr's rejection as `apiRejected`,
 * anything else as `channelFailed` with its description.
 */
export function asTransportError(thrown: unknown): TransportError {
  if (thrown instanceof TransportFailure) return thrown.error;
  if (thrown instanceof HerdrApiError) {
    return { kind: 'apiRejected', code: thrown.code, message: thrown.message };
  }
  return {
    kind: 'channelFailed',
    detail: thrown instanceof Error ? thrown.message : String(thrown),
  };
}
