import { describe, expect, it } from 'vitest';
import { HerdrApiError } from './herdr-api-error';
import {
  asTransportError,
  isHostKeySecurityFailure,
  isRetryable,
  type TransportError,
  TransportFailure,
  type TransportRouteFailure,
} from './transport-error';

// The retry table and the host-key security rule, ported from the Swift TransportError,
// TransportErrorPresentationTests and NoRouteReachedTests cases.

const known = 'SHA256:known';
const presented = 'SHA256:presented';
const mismatch: TransportError = { kind: 'hostKeyMismatch', known, presented };

/** One instance of every leaf kind, with the retry decision the Swift table makes. */
const TABLE: readonly [TransportError, boolean][] = [
  [{ kind: 'sshUnreachable', detail: 'refused' }, true],
  [{ kind: 'timedOut' }, true],
  [{ kind: 'cancelled' }, true],
  [{ kind: 'channelFailed', detail: 'reset' }, true],
  [{ kind: 'attachExited', status: 1, output: 'herdr: lost connection to server' }, true],
  [{ kind: 'apiRejected', code: 'busy', message: 'try later' }, true],
  [{ kind: 'authenticationFailed' }, false],
  [{ kind: 'tcpForwardingUnavailable' }, false],
  [{ kind: 'deviceKeyCorrupt' }, false],
  [{ kind: 'rsaKeyCorrupt' }, false],
  [{ kind: 'rsaSignatureUnsupported' }, false],
  [{ kind: 'keyAccessNotConfirmed' }, false],
  [{ kind: 'hostKeyRejected', presented }, false],
  [mismatch, false],
  [{ kind: 'socketNotFound', path: '/tmp/herdr.sock' }, false],
  [{ kind: 'herdrBinaryNotFound' }, false],
  [{ kind: 'herdrLauncherNotFound', path: '/opt/example/bin/herdr' }, false],
  [{ kind: 'streamLocalOpenFailed', path: '/tmp/herdr.sock' }, false],
  [{ kind: 'protocolVersionMismatch', server: 16, supported: 17 }, false],
  [{ kind: 'homeDirectoryUnresolvable', detail: 'echo $HOME failed' }, false],
  [{ kind: 'invalidDirectoryPath', path: '/x' }, false],
  [{ kind: 'eventsChannelAlreadyOpen' }, false],
  [{ kind: 'terminalChannelAlreadyOpen' }, false],
  [{ kind: 'gitTimedOut' }, false],
  [{ kind: 'hostFileTimedOut' }, false],
  [{ kind: 'hostFileUnreadable', status: 3 }, false],
  [{ kind: 'hostStoreUnreadable', detail: "OpenCode's database is busy." }, false],
  [{ kind: 'hostFeatureUnavailable', feature: 'ports' }, false],
  [{ kind: 'malformedResponse', detail: '{' }, false],
];

const route = (
  name: string,
  mayNameAnotherMachine: boolean,
  error: TransportError,
): TransportRouteFailure => ({ route: name, mayNameAnotherMachine, routeId: null, error });

describe('isRetryable', () => {
  it.each(TABLE)('%o -> %s', (error, retryable) => {
    expect(isRetryable(error)).toBe(retryable);
  });

  it('follows the failure behind a Jump Host, at any depth', () => {
    for (const [error, retryable] of TABLE) {
      expect(isRetryable({ kind: 'jumpHostFailed', underlying: error })).toBe(retryable);
      const nested: TransportError = {
        kind: 'jumpHostFailed',
        underlying: { kind: 'jumpHostFailed', underlying: error },
      };
      expect(isRetryable(nested)).toBe(retryable);
    }
  });

  it('retries while any route may come back on its own', () => {
    const error: TransportError = {
      kind: 'noRouteReached',
      failures: [
        route('192.168.1.5', true, mismatch),
        route('100.64.0.5', false, { kind: 'timedOut' }),
      ],
    };
    expect(isRetryable(error)).toBe(true);
    // A LAN address answered by another machine is not, by itself, a security stop.
    expect(isHostKeySecurityFailure(error)).toBe(false);
  });

  it('stops the race on a changed key at a route that names the same machine everywhere', () => {
    for (const failure of [mismatch, { kind: 'jumpHostFailed', underlying: mismatch } as const]) {
      const error: TransportError = {
        kind: 'noRouteReached',
        failures: [
          route('192.168.1.5', true, { kind: 'timedOut' }),
          route('box.example', false, failure),
        ],
      };
      expect(isHostKeySecurityFailure(error)).toBe(true);
      expect(isRetryable(error)).toBe(false);
    }
  });

  it('stops when no route can recover on its own', () => {
    const error: TransportError = {
      kind: 'noRouteReached',
      failures: [route('192.168.1.5', true, mismatch), route('100.64.0.5', false, mismatch)],
    };
    expect(isRetryable(error)).toBe(false);
    expect(isHostKeySecurityFailure(error)).toBe(true);
    expect(isRetryable({ kind: 'noRouteReached', failures: [] })).toBe(false);
  });

  it('counts LAN-only key changes as a security failure once every route failed on its key', () => {
    const error: TransportError = {
      kind: 'noRouteReached',
      failures: [route('192.168.1.5', true, mismatch), route('nas.local', true, mismatch)],
    };
    expect(isHostKeySecurityFailure(error)).toBe(true);
    expect(isRetryable(error)).toBe(false);
  });
});

describe('isHostKeySecurityFailure', () => {
  it('keeps the classification through Jump Hosts and nothing else carries it', () => {
    expect(isHostKeySecurityFailure(mismatch)).toBe(true);
    expect(isHostKeySecurityFailure({ kind: 'jumpHostFailed', underlying: mismatch })).toBe(true);
    expect(
      isHostKeySecurityFailure({
        kind: 'jumpHostFailed',
        underlying: { kind: 'jumpHostFailed', underlying: mismatch },
      }),
    ).toBe(true);
    expect(
      isHostKeySecurityFailure({ kind: 'jumpHostFailed', underlying: { kind: 'timedOut' } }),
    ).toBe(false);
    expect(isHostKeySecurityFailure({ kind: 'authenticationFailed' })).toBe(false);
    expect(isHostKeySecurityFailure({ kind: 'hostKeyRejected', presented })).toBe(false);
  });
});

describe('asTransportError', () => {
  it('unwraps a carried error, maps a herdr rejection, and wraps anything else', () => {
    expect(asTransportError(new TransportFailure({ kind: 'timedOut' }))).toEqual({
      kind: 'timedOut',
    });
    expect(asTransportError(new HerdrApiError('pane_not_found', 'gone'))).toEqual({
      kind: 'apiRejected',
      code: 'pane_not_found',
      message: 'gone',
    });
    expect(asTransportError(new Error('socket hang up'))).toEqual({
      kind: 'channelFailed',
      detail: 'socket hang up',
    });
    expect(asTransportError('boom')).toEqual({ kind: 'channelFailed', detail: 'boom' });
  });

  it('keeps a thrown failure an Error with its kind in the message', () => {
    const failure = new TransportFailure({ kind: 'cancelled' });
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toContain('cancelled');
  });
});

describe('HerdrApiError', () => {
  it('recognizes only the canonical-mode refusal of agent.start', () => {
    const refusal = new HerdrApiError(
      'agent_start_input_failed',
      'launch line exceeds the input limit while the shell is in canonical mode',
    );
    expect(refusal.isCanonicalModeRefusal).toBe(true);
    expect(
      new HerdrApiError('agent_start_input_failed', 'could not determine canonical input capacity')
        .isCanonicalModeRefusal,
    ).toBe(false);
    expect(new HerdrApiError('other', 'canonical mode').isCanonicalModeRefusal).toBe(false);
  });
});
