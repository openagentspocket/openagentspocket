import { fingerprintDisplay } from './fingerprint';
import type { AuthMethod } from './host';
import type { PreflightError } from './preflight-error';

/**
 * The onboarding checklist, in order. One connect + ping exercises the whole
 * chain, so a run fails at exactly one check: everything before it worked,
 * everything after it is unknown.
 */
export const PREFLIGHT_CHECKS = [
  /** SSH reachable, credentials accepted, host key trusted. */
  'connection',
  /** The login shell exposes a usable absolute home directory. */
  'remoteEnvironment',
  /** The herdr socket path exists on the Host. */
  'herdrInstalled',
  /** The socket accepts connections (a wake attempt already ran). */
  'serverRunning',
  /** The server speaks a protocol version this build supports. */
  'protocolCompatible',
] as const;
export type PreflightCheck = (typeof PREFLIGHT_CHECKS)[number];

/**
 * A fix-it hint as an i18n key plus its arguments; the UI owns the words.
 * `endpoint*` keys point at a Host's configured herdr instance (Pairing Code v2),
 * `jumpHost*` keys at the first hop, which is the machine to fix there.
 */
export type PreflightHintKey =
  | 'sshUnreachable'
  | 'deviceKeyRejected'
  | 'rsaKeyRejected'
  | 'passwordRejected'
  | 'deviceKeyCorrupt'
  | 'rsaKeyCorrupt'
  | 'rsaSignatureUnsupported'
  | 'keyAccessNotConfirmed'
  | 'hostKeyRejected'
  | 'hostKeyChanged'
  | 'tcpForwardingUnavailable'
  | 'timedOut'
  | 'gitTimedOut'
  | 'hostFileFailed'
  | 'cancelled'
  | 'channelFailed'
  | 'attachExited'
  | 'connectionBusy'
  | 'unexpected'
  | 'jumpHostUnreachable'
  | 'jumpHostDeviceKeyRejected'
  | 'jumpHostRsaKeyRejected'
  | 'jumpHostPasswordRejected'
  | 'jumpHostKeyRejected'
  | 'jumpHostKeyChanged'
  | 'jumpHostDeviceKeyCorrupt'
  | 'jumpHostRsaKeyCorrupt'
  | 'jumpHostRsaSignatureUnsupported'
  | 'jumpHostTimedOut'
  | 'jumpHostFailed'
  | 'hostFeatureUnavailable'
  | 'homeDirectoryUnresolvable'
  | 'invalidDirectoryPath'
  | 'socketNotFound'
  | 'endpointSocketNotFound'
  | 'herdrBinaryNotFound'
  | 'herdrLauncherNotFound'
  | 'streamLocalOpenFailed'
  | 'endpointStreamLocalOpenFailed'
  | 'apiRejected'
  | 'protocolTooOld'
  | 'endpointProtocolTooOld'
  | 'malformedResponse';

export type PreflightHint =
  | {
      readonly key: PreflightHintKey;
      readonly params: Readonly<Record<string, string | number>>;
      /** The error behind a generic hint, for the UI to describe. */
      readonly cause?: PreflightError;
    }
  /** No route reached the Host: each route keeps the hint for its own failure. */
  | { readonly key: 'routes'; readonly routes: readonly { route: string; hint: PreflightHint }[] };

export type PreflightCheckStatus =
  | { readonly state: 'passed' }
  /** This check's failure stopped the run. */
  | { readonly state: 'failed'; readonly hint: PreflightHint }
  /** Unknown: an earlier check failed before this one could run. */
  | { readonly state: 'blocked' };

/** The check a run failed at, with its fix-it hint. */
export interface PreflightFailure {
  readonly check: PreflightCheck;
  readonly hint: PreflightHint;
}

/** One run's outcome; `failure` null means every check passed. */
export interface PreflightReport {
  readonly failure: PreflightFailure | null;
}

export const PREFLIGHT_ALL_PASSED: PreflightReport = { failure: null };

/** A failure outside the transport taxonomy (for example no stored password). */
export function preflightFailure(check: PreflightCheck, hint: PreflightHint): PreflightReport {
  return { failure: { check, hint } };
}

function hint(
  key: PreflightHintKey,
  params: Record<string, string | number> = {},
  cause?: PreflightError,
): PreflightHint {
  return cause ? { key, params, cause } : { key, params };
}

const REJECTED_KEY: Record<AuthMethod, PreflightHintKey> = {
  deviceKey: 'deviceKeyRejected',
  rsaKey: 'rsaKeyRejected',
  password: 'passwordRejected',
};

const JUMP_REJECTED_KEY: Record<AuthMethod, PreflightHintKey> = {
  deviceKey: 'jumpHostDeviceKeyRejected',
  rsaKey: 'jumpHostRsaKeyRejected',
  password: 'jumpHostPasswordRejected',
};

/**
 * Guidance for a first-hop failure. Deliberately not the Host-facing hints:
 * those send the user to fix the Host, which is the wrong machine here.
 */
function jumpHostHint(error: PreflightError, authMethod: AuthMethod): PreflightHint {
  switch (error.kind) {
    case 'sshUnreachable':
      return hint('jumpHostUnreachable', { detail: error.detail });
    case 'authenticationFailed':
      return hint(JUMP_REJECTED_KEY[authMethod]);
    case 'hostKeyRejected':
      return hint('jumpHostKeyRejected');
    case 'hostKeyMismatch':
      return hint('jumpHostKeyChanged', {
        known: fingerprintDisplay(error.known),
        presented: fingerprintDisplay(error.presented),
      });
    case 'deviceKeyCorrupt':
      return hint('jumpHostDeviceKeyCorrupt');
    case 'rsaKeyCorrupt':
      return hint('jumpHostRsaKeyCorrupt');
    case 'rsaSignatureUnsupported':
      return hint('jumpHostRsaSignatureUnsupported');
    case 'timedOut':
      return hint('jumpHostTimedOut');
    case 'cancelled':
      return hint('cancelled');
    default:
      return hint('jumpHostFailed', {}, error);
  }
}

function mapConnection(error: PreflightError, authMethod: AuthMethod): PreflightHint | null {
  switch (error.kind) {
    case 'sshUnreachable':
      return hint('sshUnreachable', { detail: error.detail });
    case 'authenticationFailed':
      return hint(REJECTED_KEY[authMethod]);
    case 'hostKeyRejected':
      return hint('hostKeyRejected');
    case 'hostKeyMismatch':
      return hint('hostKeyChanged', {
        known: fingerprintDisplay(error.known),
        presented: fingerprintDisplay(error.presented),
      });
    case 'channelFailed':
      return hint('channelFailed', { detail: error.detail });
    case 'attachExited':
      return hint('attachExited', { status: error.status, output: error.output ?? '' });
    case 'jumpHostFailed':
      return jumpHostHint(error.underlying, authMethod);
    case 'noRouteReached':
      return {
        key: 'routes',
        routes: error.failures.map((failure) => ({
          route: failure.route,
          hint: preflightFailureFor(failure.error, authMethod).hint,
        })),
      };
    case 'deviceKeyCorrupt':
    case 'rsaKeyCorrupt':
    case 'rsaSignatureUnsupported':
    case 'keyAccessNotConfirmed':
    case 'tcpForwardingUnavailable':
    case 'timedOut':
    case 'gitTimedOut':
    case 'cancelled':
      return hint(error.kind);
    // Not reachable from connect + ping; the closed taxonomy stays total.
    case 'hostFileTimedOut':
    case 'hostFileUnreadable':
    case 'hostStoreUnreadable':
      return hint('hostFileFailed');
    case 'eventsChannelAlreadyOpen':
    case 'terminalChannelAlreadyOpen':
      return hint('connectionBusy');
    default:
      return null;
  }
}

/**
 * Maps a transport failure onto the check it disproves, with a fix-it hint.
 * `authMethod` steers the credential hint; `usesHerdrEndpoint` points the
 * socket and protocol hints at the Host's configured herdr instance.
 */
export function preflightFailureFor(
  error: PreflightError,
  authMethod: AuthMethod,
  usesHerdrEndpoint = false,
): PreflightFailure {
  const endpoint = usesHerdrEndpoint;
  // Everything up to the Host's SSH server, its credentials and its key.
  const connection = mapConnection(error, authMethod);
  if (connection) return { check: 'connection', hint: connection };
  switch (error.kind) {
    case 'hostFeatureUnavailable':
      return { check: 'remoteEnvironment', hint: hint(error.kind, { feature: error.feature }) };
    case 'homeDirectoryUnresolvable':
      return { check: 'remoteEnvironment', hint: hint(error.kind, { detail: error.detail }) };
    case 'invalidDirectoryPath':
      return { check: 'remoteEnvironment', hint: hint(error.kind, { path: error.path }) };
    case 'socketNotFound':
      return {
        check: 'herdrInstalled',
        hint: hint(endpoint ? 'endpointSocketNotFound' : 'socketNotFound', { path: error.path }),
      };
    case 'herdrBinaryNotFound':
      return { check: 'herdrInstalled', hint: hint(error.kind) };
    case 'herdrLauncherNotFound':
      return { check: 'herdrInstalled', hint: hint(error.kind, { path: error.path }) };
    case 'streamLocalOpenFailed':
      return {
        check: 'serverRunning',
        hint: hint(endpoint ? 'endpointStreamLocalOpenFailed' : 'streamLocalOpenFailed', {
          path: error.path,
        }),
      };
    case 'apiRejected':
      return {
        check: 'serverRunning',
        hint: hint(error.kind, { code: error.code, message: error.message }),
      };
    case 'protocolVersionMismatch':
      // Only below the floor: a newer Host connects with an advisory notice.
      return {
        check: 'protocolCompatible',
        hint: hint(endpoint ? 'endpointProtocolTooOld' : 'protocolTooOld', {
          server: error.server,
          supported: error.supported,
        }),
      };
    case 'malformedResponse':
      return { check: 'protocolCompatible', hint: hint(error.kind, { detail: error.detail }) };
    default:
      return { check: 'connection', hint: hint('unexpected', {}, error) };
  }
}

export function preflightReportFor(
  error: PreflightError,
  authMethod: AuthMethod,
  usesHerdrEndpoint = false,
): PreflightReport {
  return { failure: preflightFailureFor(error, authMethod, usesHerdrEndpoint) };
}

/** Checks before the failed one passed; the failed one carries its hint; later ones are blocked. */
export function preflightStatus(
  report: PreflightReport,
  check: PreflightCheck,
): PreflightCheckStatus {
  if (!report.failure) return { state: 'passed' };
  const failed = PREFLIGHT_CHECKS.indexOf(report.failure.check);
  const index = PREFLIGHT_CHECKS.indexOf(check);
  if (index < failed) return { state: 'passed' };
  if (index === failed) return { state: 'failed', hint: report.failure.hint };
  return { state: 'blocked' };
}

export function preflightFullyPassed(report: PreflightReport): boolean {
  return report.failure === null;
}
