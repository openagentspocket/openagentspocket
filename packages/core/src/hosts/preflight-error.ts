import type { HostKeyFingerprint } from './fingerprint';
import type { RouteFailure } from './ssh-route';

/**
 * The transport failures preflight maps onto its checks: the Swift
 * `TransportError` taxonomy, kind-tagged, without Overlay Networks (dropped in
 * the port). The wire/error-model task owns the full type; it should stay
 * assignable to this one so preflight takes it as is.
 */
export type PreflightError =
  | { readonly kind: 'sshUnreachable'; readonly detail: string }
  | { readonly kind: 'jumpHostFailed'; readonly underlying: PreflightError }
  | { readonly kind: 'noRouteReached'; readonly failures: readonly RouteFailure<PreflightError>[] }
  | { readonly kind: 'tcpForwardingUnavailable' }
  | { readonly kind: 'authenticationFailed' }
  | { readonly kind: 'deviceKeyCorrupt' }
  | { readonly kind: 'rsaKeyCorrupt' }
  | { readonly kind: 'rsaSignatureUnsupported' }
  | { readonly kind: 'keyAccessNotConfirmed' }
  | { readonly kind: 'hostKeyRejected'; readonly presented: HostKeyFingerprint }
  | {
      readonly kind: 'hostKeyMismatch';
      readonly known: HostKeyFingerprint;
      readonly presented: HostKeyFingerprint;
    }
  | { readonly kind: 'socketNotFound'; readonly path: string }
  | { readonly kind: 'herdrBinaryNotFound' }
  | { readonly kind: 'herdrLauncherNotFound'; readonly path: string }
  | { readonly kind: 'streamLocalOpenFailed'; readonly path: string }
  | {
      readonly kind: 'protocolVersionMismatch';
      readonly server: number;
      readonly supported: number;
    }
  | { readonly kind: 'homeDirectoryUnresolvable'; readonly detail: string }
  | { readonly kind: 'invalidDirectoryPath'; readonly path: string }
  | { readonly kind: 'eventsChannelAlreadyOpen' }
  | { readonly kind: 'terminalChannelAlreadyOpen' }
  | { readonly kind: 'timedOut' }
  | { readonly kind: 'gitTimedOut' }
  | { readonly kind: 'hostFileTimedOut' }
  | { readonly kind: 'hostFileUnreadable'; readonly status: number }
  | { readonly kind: 'hostStoreUnreadable'; readonly detail: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'malformedResponse'; readonly detail: string }
  | { readonly kind: 'apiRejected'; readonly code: string; readonly message: string }
  | { readonly kind: 'channelFailed'; readonly detail: string }
  | { readonly kind: 'attachExited'; readonly status: number; readonly output: string | null }
  | { readonly kind: 'hostFeatureUnavailable'; readonly feature: string };
