import { describe, expect, it, vi } from 'vitest';
import v1 from '../../../plugin/test-vectors/pairing-code-v1.json';
import v2 from '../../../plugin/test-vectors/pairing-code-v2.json';
import { failureStep, PairingCancelledError, type PairingCeremonyFailure } from './ceremony';
import type { PairingMessageId } from './failure';
import {
  decoded,
  INSIDE_TTL_MS,
  makeEnv,
  PAIRED_RESULT,
  PRESENTED,
  vectorCodes,
} from './scan-store-harness';

const CODES = vectorCodes(v1, v2);

describe('PairingScanStore: scanning (the parse step)', () => {
  it('parses a scanned Pairing Code', () => {
    const { store } = makeEnv();
    store.submit(CODES.configOnly);
    expect(store.getState().pairingCode).toEqual(decoded(CODES.configOnly));
    expect(store.getState().scanFailure).toBeNull();
  });

  it('parses a pasted code with a trailing newline the same way', () => {
    const { store } = makeEnv();
    store.submit(`${CODES.configOnly}\n`);
    expect(store.getState().pairingCode).toEqual(decoded(CODES.configOnly));
  });

  it.each([
    ['a pasted malformed code', '  not-a-pairing-code  ', 'scanNotAPairingCode', []],
    ['a foreign QR code', 'https://example.com/some-other-qr', 'scanNotAPairingCode', []],
    [
      'an unsupported version',
      'HERDR-PAIR:3:eyJhZGRycyI6WyIxOTIuMTY4LjEuNDIiXX0',
      'scanUnsupportedVersion',
      ['3'],
    ],
    ['a corrupt code', 'HERDR-PAIR:1:!!!corrupt!!!', 'scanUnreadable', []],
  ])('explains %s', (_, scanned, id, args) => {
    const { store } = makeEnv();
    store.submit(scanned);
    expect(store.getState().pairingCode).toBeNull();
    expect(store.getState().scanFailure).toEqual({ id, args });
  });

  it('clears an earlier failure on a good scan', () => {
    const { store } = makeEnv();
    store.submit('HERDR-PAIR:1:!!!corrupt!!!');
    store.submit(CODES.configOnly);
    expect(store.getState().pairingCode).not.toBeNull();
    expect(store.getState().scanFailure).toBeNull();
  });

  it('ignores further scans once a code parsed', () => {
    const { store } = makeEnv();
    store.submit(CODES.configOnly);
    store.submit('HERDR-PAIR:1:!!!corrupt!!!');
    expect(store.getState().pairingCode).toEqual(decoded(CODES.configOnly));
    expect(store.getState().scanFailure).toBeNull();
  });

  it('returns to a fresh scanning state on rescan, even after a ceremony failure', async () => {
    const { store } = makeEnv({ outcomes: [{ fails: { kind: 'bootstrapRejected' } }] });
    store.submit(CODES.bootstrap);
    await store.pair();
    expect(store.getState().failure).not.toBeNull();
    store.rescan();
    expect(store.getState()).toMatchObject({ pairingCode: null, failure: null, scanFailure: null });
  });

  it('notifies subscribers of every change', () => {
    const { store } = makeEnv();
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    store.submit(CODES.configOnly);
    unsubscribe();
    store.rescan();
    expect(calls).toBe(1);
  });
});

describe('PairingScanStore: success', () => {
  it('saves the Host with its pinned fingerprint and this device key', async () => {
    const { store, connector, catalog, deviceKey } = makeEnv();
    store.submit(CODES.bootstrap);
    await store.pair();

    expect(connector.capturedDeviceKeys).toEqual([deviceKey]);
    const state = store.getState();
    expect(catalog.saved).toHaveLength(1);
    const host = catalog.saved[0];
    expect(state.pairedHostId).toBe(host?.id);
    expect(host).toMatchObject({ username: 'lin', usesDeviceKey: true, endpoint: null });
    expect(host?.routes).toEqual([{ address: '10.0.0.7', port: 22, usesJumpHost: false }]);
    expect(catalog.pins.get(host?.id ?? '')).toEqual([PRESENTED]);
    expect(state).toMatchObject({ failure: null, isPairing: false, step: null });
  });

  it('turns every candidate into a route, led by the one that answered', async () => {
    const answered = {
      ...PAIRED_RESULT,
      address: '100.101.102.103',
      port: 2222,
      username: 'grace',
    };
    const { store, catalog } = makeEnv({ outcomes: [{ succeeds: answered }] });
    store.submit(CODES.multiAddress);
    await store.pair();
    expect(catalog.saved[0]?.routes.map((r) => `${r.address}:${r.port}`)).toEqual([
      '100.101.102.103:2222',
      '192.168.1.42:2222',
      'fd7a:115c:a1e0::1:2222',
    ]);
  });

  it('takes the Herdr Endpoint from a version 2 code', async () => {
    const { store, catalog, connector } = makeEnv();
    store.submit(CODES.endpoint);
    const expected = decoded(CODES.endpoint).endpoint;
    expect(expected).not.toBeNull();
    await store.pair();
    expect(catalog.saved[0]?.endpoint).toEqual(expected);
    expect(catalog.saved[0]?.sessionName).toBe('');
    expect(connector.capturedCodes[0]?.endpoint).toEqual(expected);
  });

  it('ignores pairing again after a success', async () => {
    const { store, connector, catalog } = makeEnv();
    store.submit(CODES.bootstrap);
    await store.pair();
    await store.pair();
    expect(connector.capturedCodes).toHaveLength(1);
    expect(catalog.saved).toHaveLength(1);
  });

  it('saves nothing until the verified reconnect returns', async () => {
    const { store, connector, catalog } = makeEnv();
    connector.hold();
    store.submit(CODES.bootstrap);
    const run = store.pair();
    await vi.waitFor(() => expect(store.getState().step).toBe('verify'));
    expect(store.getState()).toMatchObject({ isPairing: true, pairedHostId: null });
    expect(catalog.saved).toEqual([]);
    connector.release();
    await run;
    expect(store.getState().pairedHostId).not.toBeNull();
    expect(catalog.saved).toHaveLength(1);
  });
});

const FAILURES: [PairingCeremonyFailure, boolean, PairingMessageId][] = [
  [{ kind: 'hostUnreachable', detail: 'x' }, true, 'hostUnreachable'],
  [{ kind: 'tailscaleSSH', addresses: ['100.64.0.1'], port: 22 }, false, 'tailscaleSSH'],
  [{ kind: 'bootstrapRejected' }, false, 'bootstrapRejected'],
  [{ kind: 'enrollmentRefused', refusal: { kind: 'unknownPairing' } }, false, 'unknownPairing'],
  [{ kind: 'enrollmentRefused', refusal: { kind: 'expired' } }, false, 'codeExpired'],
  [{ kind: 'enrollmentRefused', refusal: { kind: 'invalidKey' } }, true, 'invalidKey'],
  [{ kind: 'enrollmentRefused', refusal: { kind: 'noInput' } }, true, 'noInput'],
  [
    { kind: 'enrollmentRefused', refusal: { kind: 'unrecognized', code: 'quota_exceeded' } },
    false,
    'refusalUnrecognized',
  ],
  [{ kind: 'enrollmentUnanswered' }, false, 'enrollmentUnanswered'],
  [{ kind: 'enrollmentFailed', detail: 'x' }, true, 'enrollmentFailed'],
  [{ kind: 'verificationFailed', detail: 'x' }, true, 'enrolledNotVerified'],
];

describe('PairingScanStore: failures', () => {
  it.each(FAILURES.map((row) => [row[0].kind, ...row] as const))(
    '%s: copy per step, retry guidance, nothing persisted',
    async (_, error, canRetry, id) => {
      const { store, catalog } = makeEnv({ outcomes: [{ fails: error }] });
      store.submit(CODES.bootstrap);
      await store.pair();
      const state = store.getState();
      expect(state.failure).toMatchObject({ step: failureStep(error), canRetry, message: { id } });
      expect(state).toMatchObject({ pairedHostId: null, isPairing: false, step: null });
      expect(catalog.saved).toEqual([]);
      expect(catalog.pins.size).toBe(0);
    },
  );

  it('names the port and addresses Tailscale SSH answered at', async () => {
    const { store } = makeEnv({
      outcomes: [
        { fails: { kind: 'tailscaleSSH', addresses: ['100.64.0.1', '100.64.0.2'], port: 22 } },
      ],
    });
    store.submit(CODES.bootstrap);
    await store.pair();
    expect(store.getState().failure?.message.args).toEqual(['22', '100.64.0.1, 100.64.0.2']);
  });

  it('reports an expired code without connecting', async () => {
    const { store, connector, catalog } = makeEnv({ nowMs: 1_753_305_601_000 });
    store.submit(CODES.bootstrap);
    await store.pair();
    expect(store.getState().failure).toEqual({
      step: 'parse',
      message: { id: 'codeExpired', args: [] },
      canRetry: false,
    });
    expect(connector.capturedCodes).toEqual([]);
    expect(catalog.saved).toEqual([]);
  });

  it.each([
    [
      'an unloadable Device Key',
      { ok: false, reason: 'unavailable' } as const,
      'deviceKeyUnavailable',
      false,
    ],
    ['a failing key store', 'throws' as const, 'deviceKeyUnavailable', false],
    ['a locked Device Key', { ok: false, reason: 'locked' } as const, 'deviceKeyLocked', true],
  ])('fails before the ceremony on %s', async (_, deviceKeyLoad, id, canRetry) => {
    const { store, connector } = makeEnv({ deviceKeyLoad });
    store.submit(CODES.bootstrap);
    await store.pair();
    expect(store.getState().failure).toMatchObject({ step: 'parse', canRetry, message: { id } });
    expect(connector.capturedCodes).toEqual([]);
  });

  it('surfaces an unwritable catalog and pins nothing', async () => {
    const { store, catalog } = makeEnv();
    catalog.unwritable = true;
    store.submit(CODES.bootstrap);
    await store.pair();
    expect(store.getState().failure).toMatchObject({
      canRetry: false,
      message: { id: 'saveFailed' },
    });
    expect(store.getState().pairedHostId).toBeNull();
    expect(catalog.pins.size).toBe(0);
  });

  it('reports an unexpected error as retryable', async () => {
    const { store } = makeEnv({ outcomes: [{ throws: new Error('boom') }] });
    store.submit(CODES.bootstrap);
    await store.pair();
    expect(store.getState().failure).toMatchObject({
      canRetry: true,
      message: { id: 'unexpected', args: ['boom'] },
    });
  });

  it('ends a cancelled ceremony quietly', async () => {
    const { store, catalog } = makeEnv({ outcomes: [{ throws: new PairingCancelledError() }] });
    store.submit(CODES.bootstrap);
    await store.pair();
    expect(store.getState()).toMatchObject({ failure: null, isPairing: false, pairedHostId: null });
    expect(catalog.saved).toEqual([]);
  });

  it('abandons a running attempt on cancel, saving nothing', async () => {
    const { store, connector, catalog } = makeEnv();
    connector.hold();
    store.submit(CODES.bootstrap);
    const run = store.pair();
    await vi.waitFor(() => expect(store.getState().step).toBe('verify'));
    store.cancel();
    connector.release();
    await run;
    expect(store.getState()).toMatchObject({
      failure: null,
      isPairing: false,
      step: null,
      pairedHostId: null,
    });
    expect(catalog.saved).toEqual([]);
    expect(catalog.pins.size).toBe(0);

    // The cancellation belongs to that attempt: Try Again runs a fresh one.
    await store.pair();
    expect(store.getState().pairedHostId).not.toBeNull();
  });

  it('keeps INSIDE_TTL_MS inside the vector expiry', () => {
    expect(decoded(CODES.bootstrap).bootstrap?.expiresAt).toBeGreaterThan(INSIDE_TTL_MS / 1000);
  });
});
