import { describe, expect, it } from 'vitest';
import { fingerprintDisplay, fingerprintFromBlob } from './fingerprint';
import {
  PREFLIGHT_ALL_PASSED,
  PREFLIGHT_CHECKS,
  type PreflightCheck,
  preflightFailure,
  preflightFailureFor,
  preflightFullyPassed,
  preflightReportFor,
  preflightStatus,
} from './preflight';
import type { PreflightError } from './preflight-error';

const bytes = (text: string) => new TextEncoder().encode(text);
const fingerprintA = fingerprintFromBlob(bytes('blob-a'));
const fingerprintB = fingerprintFromBlob(bytes('blob-b'));
const socket = '/home/dev/.config/herdr/herdr.sock';

const failedKey = (error: PreflightError, authMethod = 'deviceKey' as const, endpoint = false) =>
  preflightFailureFor(error, authMethod, endpoint).hint.key;

describe('preflight report', () => {
  it('passes every check on success', () => {
    for (const check of PREFLIGHT_CHECKS) {
      expect(preflightStatus(PREFLIGHT_ALL_PASSED, check)).toEqual({ state: 'passed' });
    }
    expect(preflightFullyPassed(PREFLIGHT_ALL_PASSED)).toBe(true);
  });

  it('passes earlier checks, fails one, and blocks later ones', () => {
    const report = preflightReportFor({ kind: 'socketNotFound', path: socket }, 'deviceKey');
    expect(preflightStatus(report, 'connection').state).toBe('passed');
    expect(preflightStatus(report, 'remoteEnvironment').state).toBe('passed');
    expect(preflightStatus(report, 'herdrInstalled')).toEqual({
      state: 'failed',
      hint: { key: 'socketNotFound', params: { path: socket } },
    });
    expect(preflightStatus(report, 'serverRunning').state).toBe('blocked');
    expect(preflightStatus(report, 'protocolCompatible').state).toBe('blocked');
    expect(preflightFullyPassed(report)).toBe(false);
  });

  it.each<[PreflightError, PreflightCheck]>([
    [{ kind: 'sshUnreachable', detail: 'refused' }, 'connection'],
    [{ kind: 'authenticationFailed' }, 'connection'],
    [{ kind: 'deviceKeyCorrupt' }, 'connection'],
    [{ kind: 'rsaKeyCorrupt' }, 'connection'],
    [{ kind: 'rsaSignatureUnsupported' }, 'connection'],
    [{ kind: 'keyAccessNotConfirmed' }, 'connection'],
    [{ kind: 'hostKeyRejected', presented: fingerprintA }, 'connection'],
    [{ kind: 'timedOut' }, 'connection'],
    // Not reachable from connect + ping; the closed taxonomy stays total.
    [{ kind: 'gitTimedOut' }, 'connection'],
    [{ kind: 'hostFileTimedOut' }, 'connection'],
    [{ kind: 'hostFileUnreadable', status: 3 }, 'connection'],
    [{ kind: 'hostStoreUnreadable', detail: 'busy' }, 'connection'],
    [{ kind: 'cancelled' }, 'connection'],
    [{ kind: 'channelFailed', detail: 'boom' }, 'connection'],
    [{ kind: 'attachExited', status: 1, output: 'herdr: lost connection' }, 'connection'],
    [{ kind: 'eventsChannelAlreadyOpen' }, 'connection'],
    [{ kind: 'terminalChannelAlreadyOpen' }, 'connection'],
    [{ kind: 'herdrBinaryNotFound' }, 'herdrInstalled'],
    [{ kind: 'herdrLauncherNotFound', path: '/opt/example/bin/herdr' }, 'herdrInstalled'],
    [
      { kind: 'hostFeatureUnavailable', feature: 'Windows requires remote-api-bridge' },
      'remoteEnvironment',
    ],
    [
      { kind: 'jumpHostFailed', underlying: { kind: 'sshUnreachable', detail: 'refused' } },
      'connection',
    ],
    [{ kind: 'tcpForwardingUnavailable' }, 'connection'],
    [{ kind: 'socketNotFound', path: socket }, 'herdrInstalled'],
    [{ kind: 'homeDirectoryUnresolvable', detail: 'no $HOME' }, 'remoteEnvironment'],
    [{ kind: 'invalidDirectoryPath', path: 'rel' }, 'remoteEnvironment'],
    [{ kind: 'streamLocalOpenFailed', path: socket }, 'serverRunning'],
    [{ kind: 'apiRejected', code: 'x', message: 'no' }, 'serverRunning'],
    // Below the floor: the only direction that still produces this error.
    [{ kind: 'protocolVersionMismatch', server: 16, supported: 17 }, 'protocolCompatible'],
    [{ kind: 'malformedResponse', detail: 'junk' }, 'protocolCompatible'],
  ])('maps %j onto the %s check', (error, check) => {
    expect(preflightStatus(preflightReportFor(error, 'deviceKey'), check).state).toBe('failed');
  });

  it('names both fingerprints when the host key changed', () => {
    const { hint } = preflightFailureFor(
      { kind: 'hostKeyMismatch', known: fingerprintA, presented: fingerprintB },
      'deviceKey',
    );
    expect(hint).toEqual({
      key: 'hostKeyChanged',
      params: {
        known: fingerprintDisplay(fingerprintA),
        presented: fingerprintDisplay(fingerprintB),
      },
    });
  });

  it('steers the credential hint by auth method', () => {
    const error: PreflightError = { kind: 'authenticationFailed' };
    expect(failedKey(error, 'deviceKey')).toBe('deviceKeyRejected');
    expect(preflightFailureFor(error, 'rsaKey').hint.key).toBe('rsaKeyRejected');
    expect(preflightFailureFor(error, 'password').hint.key).toBe('passwordRejected');
  });

  it('does not report an unsupported RSA signature as a rejected key, on either hop', () => {
    expect(preflightFailureFor({ kind: 'rsaSignatureUnsupported' }, 'rsaKey').hint.key).toBe(
      'rsaSignatureUnsupported',
    );
    expect(
      preflightFailureFor(
        { kind: 'jumpHostFailed', underlying: { kind: 'rsaSignatureUnsupported' } },
        'rsaKey',
      ).hint.key,
    ).toBe('jumpHostRsaSignatureUnsupported');
  });

  it('points first-hop failures at the Jump Host, never at the Host', () => {
    const jump = (
      underlying: PreflightError,
      authMethod: 'deviceKey' | 'rsaKey' | 'password' = 'password',
    ) => preflightFailureFor({ kind: 'jumpHostFailed', underlying }, authMethod).hint;
    expect(jump({ kind: 'authenticationFailed' }).key).toBe('jumpHostPasswordRejected');
    expect(jump({ kind: 'authenticationFailed' }, 'deviceKey').key).toBe(
      'jumpHostDeviceKeyRejected',
    );
    expect(jump({ kind: 'sshUnreachable', detail: 'refused' })).toEqual({
      key: 'jumpHostUnreachable',
      params: { detail: 'refused' },
    });
    expect(jump({ kind: 'hostKeyRejected', presented: fingerprintA }).key).toBe(
      'jumpHostKeyRejected',
    );
    expect(
      jump({ kind: 'hostKeyMismatch', known: fingerprintA, presented: fingerprintB }).key,
    ).toBe('jumpHostKeyChanged');
    expect(jump({ kind: 'timedOut' }).key).toBe('jumpHostTimedOut');
    const other = jump({ kind: 'channelFailed', detail: 'x' });
    expect(other.key).toBe('jumpHostFailed');
    expect('cause' in other && other.cause).toEqual({ kind: 'channelFailed', detail: 'x' });
  });

  it('names the server setting a Jump Host forwarding refusal needs', () => {
    expect(failedKey({ kind: 'tcpForwardingUnavailable' })).toBe('tcpForwardingUnavailable');
  });

  it('carries both protocol versions', () => {
    expect(
      preflightFailureFor(
        { kind: 'protocolVersionMismatch', server: 16, supported: 17 },
        'deviceKey',
      ),
    ).toEqual({
      check: 'protocolCompatible',
      hint: { key: 'protocolTooOld', params: { server: 16, supported: 17 } },
    });
  });

  it('points socket and protocol hints at a configured endpoint only when the Host has one', () => {
    const cases: [PreflightError, string, string][] = [
      [{ kind: 'socketNotFound', path: socket }, 'socketNotFound', 'endpointSocketNotFound'],
      [
        { kind: 'streamLocalOpenFailed', path: socket },
        'streamLocalOpenFailed',
        'endpointStreamLocalOpenFailed',
      ],
      [
        { kind: 'protocolVersionMismatch', server: 16, supported: 17 },
        'protocolTooOld',
        'endpointProtocolTooOld',
      ],
    ];
    for (const [error, plain, endpoint] of cases) {
      expect(failedKey(error)).toBe(plain);
      expect(failedKey(error, 'deviceKey', false)).toBe(plain);
      expect(failedKey(error, 'deviceKey', true)).toBe(endpoint);
    }
  });

  it('fails herdrInstalled naming a missing launcher', () => {
    const path = '/opt/example/bin/herdr';
    const report = preflightReportFor({ kind: 'herdrLauncherNotFound', path }, 'deviceKey', true);
    expect(preflightStatus(report, 'remoteEnvironment').state).toBe('passed');
    expect(preflightStatus(report, 'herdrInstalled')).toEqual({
      state: 'failed',
      hint: { key: 'herdrLauncherNotFound', params: { path } },
    });
    expect(preflightStatus(report, 'serverRunning').state).toBe('blocked');
  });

  it('gives each route its own hint when no route reached the Host', () => {
    const report = preflightReportFor(
      {
        kind: 'noRouteReached',
        failures: [
          {
            route: '192.168.1.5',
            mayNameAnotherMachine: true,
            error: { kind: 'timedOut' },
            routeId: null,
          },
          {
            route: '127.0.0.1:2222 via vps.example',
            mayNameAnotherMachine: false,
            error: { kind: 'jumpHostFailed', underlying: { kind: 'authenticationFailed' } },
            routeId: 'b',
          },
        ],
      },
      'deviceKey',
    );
    expect(preflightStatus(report, 'connection')).toEqual({
      state: 'failed',
      hint: {
        key: 'routes',
        routes: [
          { route: '192.168.1.5', hint: { key: 'timedOut', params: {} } },
          {
            route: '127.0.0.1:2222 via vps.example',
            hint: { key: 'jumpHostDeviceKeyRejected', params: {} },
          },
        ],
      },
    });
  });

  it('attaches a given hint to a given check', () => {
    const report = preflightFailure('connection', { key: 'unexpected', params: { detail: 'x' } });
    expect(preflightStatus(report, 'connection')).toEqual({
      state: 'failed',
      hint: { key: 'unexpected', params: { detail: 'x' } },
    });
    expect(preflightStatus(report, 'herdrInstalled').state).toBe('blocked');
  });

  it('reads an error kind it does not know as an unexpected connection failure', () => {
    const unknown = { kind: 'overlayFailed' } as unknown as PreflightError;
    expect(preflightFailureFor(unknown, 'deviceKey')).toEqual({
      check: 'connection',
      hint: { key: 'unexpected', params: {}, cause: unknown },
    });
  });
});
