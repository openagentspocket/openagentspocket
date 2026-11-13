import { describe, expect, it } from 'vitest';
import { presentation } from './presentation';
import {
  isAddressUnreachable,
  type TransportError,
  type TransportRouteFailure,
} from './transport-error';

// A Host whose address changed (DHCP after a restart) fails at the network level: its recovery
// says the address may have changed and points at pairing again or editing it. A failure with
// another cause keeps its own suggestion.

const route = (error: TransportError, address = '192.168.1.40'): TransportRouteFailure => ({
  route: address,
  mayNameAnotherMachine: true,
  routeId: null,
  error,
});
const noRoute = (...errors: TransportError[]): TransportError => ({
  kind: 'noRouteReached',
  failures: errors.map((error, index) => route(error, `10.0.0.${index + 1}`)),
});
const refused: TransportError = { kind: 'sshUnreachable', detail: 'connection refused' };
const timedOut: TransportError = { kind: 'timedOut' };
const mismatch: TransportError = {
  kind: 'hostKeyMismatch',
  known: 'SHA256:known',
  presented: 'SHA256:presented',
};

const OTHER_CAUSES: readonly TransportError[] = [
  { kind: 'authenticationFailed' },
  mismatch,
  { kind: 'hostKeyRejected', presented: 'SHA256:presented' },
  { kind: 'herdrBinaryNotFound' },
  { kind: 'socketNotFound', path: '/tmp/herdr.sock' },
  { kind: 'streamLocalOpenFailed', path: '/tmp/herdr.sock' },
  { kind: 'keyAccessNotConfirmed' },
  { kind: 'jumpHostFailed', underlying: refused },
  { kind: 'jumpHostFailed', underlying: timedOut },
  { kind: 'channelFailed', detail: 'reset' },
  noRoute(refused, { kind: 'authenticationFailed' }),
  noRoute(timedOut, { kind: 'jumpHostFailed', underlying: refused }),
  noRoute(refused, mismatch),
];

const addressHint = presentation(refused).recovery;
const routesHint = presentation(noRoute(refused)).recovery;

describe('isAddressUnreachable', () => {
  it('holds for refused, no route and timed-out dials, every route included', () => {
    expect(isAddressUnreachable(refused)).toBe(true);
    expect(isAddressUnreachable(timedOut, { connecting: true })).toBe(true);
    expect(isAddressUnreachable(noRoute(refused, timedOut))).toBe(true);
  });

  it('does not count a bare request timeout outside a connection', () => {
    expect(isAddressUnreachable(timedOut)).toBe(false);
  });

  it('rejects every failure with another cause', () => {
    for (const error of OTHER_CAUSES) {
      expect(isAddressUnreachable(error, { connecting: true }), JSON.stringify(error)).toBe(false);
    }
    expect(isAddressUnreachable({ kind: 'noRouteReached', failures: [] })).toBe(false);
  });
});

describe('the address may have changed', () => {
  it('is said for an unreachable single route', () => {
    expect(addressHint).toBeDefined();
    expect(presentation(timedOut, { connecting: true }).recovery).toEqual(addressHint);
  });

  it('is not said for a request deadline', () => {
    expect(presentation(timedOut).recovery).toBeUndefined();
  });

  it('is said when no route of the Host answered', () => {
    expect(routesHint).toBeDefined();
    expect(presentation(noRoute(timedOut, refused)).recovery).toEqual(routesHint);
    // Only a route that failed for another reason changes the suggestion.
    const generic = presentation(noRoute(refused, { kind: 'authenticationFailed' })).recovery;
    expect(generic).toBeDefined();
    expect(generic).not.toEqual(routesHint);
  });

  it('is never said for a failure with another cause', () => {
    for (const error of OTHER_CAUSES) {
      const { recovery } = presentation(error, { connecting: true });
      expect(recovery, JSON.stringify(error)).not.toEqual(addressHint);
      expect(recovery, JSON.stringify(error)).not.toEqual(routesHint);
    }
  });
});
