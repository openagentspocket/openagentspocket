import { describe, expect, it } from 'vitest';
import v1 from '../../../plugin/test-vectors/pairing-code-v1.json';
import v2 from '../../../plugin/test-vectors/pairing-code-v2.json';
import type { PairingResult } from './ceremony';
import { decoded, type Env, makeEnv, PAIRED_RESULT, vectorCodes } from './scan-store-harness';

const CODES = vectorCodes(v1, v2);
const verifyTimeout = { fails: { kind: 'verificationFailed', detail: 'timeout' } } as const;

describe('PairingScanStore: retry', () => {
  it('retries a transient failure with the same code, without rescanning', async () => {
    const { store, connector } = makeEnv({
      outcomes: [
        { fails: { kind: 'hostUnreachable', detail: 'no route' } },
        { succeeds: PAIRED_RESULT },
      ],
    });
    store.submit(CODES.bootstrap);
    await store.pair();
    expect(store.getState().failure?.canRetry).toBe(true);
    expect(store.getState().pairingCode).not.toBeNull();

    await store.pair();

    expect(store.getState().pairedHostId).not.toBeNull();
    const scanned = decoded(CODES.bootstrap);
    expect(connector.capturedCodes).toEqual([scanned, scanned]);
  });

  it('drops the spent Bootstrap Key when retrying after a verify failure', async () => {
    const { store, connector } = makeEnv({
      outcomes: [verifyTimeout, { succeeds: PAIRED_RESULT }],
    });
    store.submit(CODES.bootstrap);
    await store.pair();
    expect(store.getState().failure?.canRetry).toBe(true);

    await store.pair();

    expect(store.getState().pairedHostId).not.toBeNull();
    const [first, last] = connector.capturedCodes;
    expect(connector.capturedCodes).toHaveLength(2);
    expect(first?.bootstrap).not.toBeNull();
    expect(last?.bootstrap).toBeNull();
    expect(last?.addresses).toEqual(first?.addresses);
    expect(last?.username).toBe(first?.username);
  });

  it('keeps the Herdr Endpoint on the bootstrap-less retry', async () => {
    const { store, connector, catalog } = makeEnv({
      outcomes: [verifyTimeout, { succeeds: PAIRED_RESULT }],
    });
    const expected = decoded(CODES.endpoint).endpoint;
    store.submit(CODES.endpoint);
    await store.pair();
    await store.pair();

    expect(connector.capturedCodes[1]?.bootstrap).toBeNull();
    expect(connector.capturedCodes[1]?.endpoint).toEqual(expected);
    expect(catalog.saved[0]?.endpoint).toEqual(expected);
  });

  it('keeps the enrolled copy on a second verify failure after Enrollment', async () => {
    const { store, connector } = makeEnv({
      outcomes: [
        verifyTimeout,
        { fails: { kind: 'verificationFailed', detail: 'still no route' } },
      ],
    });
    store.submit(CODES.bootstrap);
    await store.pair();
    expect(store.getState().failure?.message.id).toBe('enrolledNotVerified');

    await store.pair();

    // The retry ran bootstrap-less, but this device WAS enrolled: no
    // regression to the config-only "authorize it yourself" guidance.
    expect(store.getState().failure).toMatchObject({
      canRetry: true,
      message: { id: 'enrolledNotVerified' },
    });
    expect(connector.capturedCodes.map((code) => code.bootstrap === null)).toEqual([false, true]);
  });

  it('points a config-only verify failure at manual authorization', async () => {
    const { store } = makeEnv({
      outcomes: [{ fails: { kind: 'verificationFailed', detail: 'auth failed' } }],
    });
    store.submit(CODES.configOnly);
    await store.pair();
    expect(store.getState().failure).toMatchObject({
      step: 'verify',
      canRetry: false,
      message: { id: 'notAuthorized' },
    });
  });

  it('starts over with the scanned Bootstrap Key after a rescan', async () => {
    const { store, connector } = makeEnv({
      outcomes: [verifyTimeout, { succeeds: PAIRED_RESULT }],
    });
    store.submit(CODES.bootstrap);
    await store.pair();
    store.rescan();
    store.submit(CODES.bootstrap);
    await store.pair();
    expect(connector.capturedCodes.map((code) => code.bootstrap === null)).toEqual([false, false]);
  });
});

async function pairTwice(env: Env) {
  env.store.submit(CODES.bootstrap);
  await env.store.pair();
  const first = env.store.getState().pairedHostId;
  env.store.rescan();
  env.store.submit(CODES.bootstrap);
  await env.store.pair();
  return { first, second: env.store.getState().pairedHostId };
}

describe('PairingScanStore: re-pairing a saved Host', () => {
  it('updates the same Host instead of adding a twin', async () => {
    const env = makeEnv({ outcomes: [{ succeeds: PAIRED_RESULT }] });
    const { first, second } = await pairTwice(env);
    expect(second).toBe(first);
    expect(env.catalog.saved).toHaveLength(1);
    expect(env.catalog.saved[0]?.routes.map((route) => route.address)).toEqual(['10.0.0.7']);
  });

  it.each<[string, PairingResult]>([
    [
      'a different host key',
      {
        ...PAIRED_RESULT,
        hostKeyFingerprint: 'SHA256:BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc',
      },
    ],
    ['another account on the same Host', { ...PAIRED_RESULT, username: 'root' }],
  ])('still adds a new Host for %s', async (_, other) => {
    const env = makeEnv({ outcomes: [{ succeeds: PAIRED_RESULT }, { succeeds: other }] });
    const { first, second } = await pairTwice(env);
    expect(second).not.toBe(first);
    expect(env.catalog.saved).toHaveLength(2);
  });

  it('does not merge a default-session code into a Host on a named session', async () => {
    const env = makeEnv({ outcomes: [{ succeeds: PAIRED_RESULT }] });
    env.store.submit(CODES.bootstrap);
    await env.store.pair();
    const saved = env.catalog.saved[0];
    expect(saved?.endpoint).toBeNull();
    // Preflight pointed it at a named herdr session.
    if (saved) env.catalog.update({ ...saved, sessionName: 'work' });

    env.store.rescan();
    env.store.submit(CODES.bootstrap);
    await env.store.pair();

    expect(env.store.getState().pairedHostId).not.toBe(saved?.id);
    expect(env.catalog.saved).toHaveLength(2);
  });

  it('surfaces an unwritable catalog when updating a twin', async () => {
    const env = makeEnv({ outcomes: [{ succeeds: PAIRED_RESULT }] });
    env.store.submit(CODES.bootstrap);
    await env.store.pair();
    const saved = env.catalog.saved[0];
    if (saved) env.catalog.update({ ...saved, routes: [] });
    env.catalog.unwritable = true;

    env.store.rescan();
    env.store.submit(CODES.bootstrap);
    await env.store.pair();

    expect(env.store.getState()).toMatchObject({
      pairedHostId: null,
      failure: { canRetry: false, message: { id: 'saveFailed' } },
    });
    expect(env.catalog.saved).toHaveLength(1);
    expect(env.catalog.saved[0]?.routes).toEqual([]);
  });

  it('keeps a stale address and adds the new one when the Host moved (DHCP)', async () => {
    const env = makeEnv({ outcomes: [{ succeeds: PAIRED_RESULT }] });
    env.store.submit(CODES.bootstrap);
    await env.store.pair();
    const saved = env.catalog.saved[0];
    const stale = { address: '192.168.1.40', port: 22, usesJumpHost: false };
    // Saved while the Host had another lease; its code now offers only the new address.
    if (saved) env.catalog.update({ ...saved, routes: [stale] });

    env.store.rescan();
    env.store.submit(CODES.bootstrap);
    await env.store.pair();

    expect(env.store.getState().pairedHostId).toBe(saved?.id);
    expect(env.catalog.saved).toHaveLength(1);
    expect(env.catalog.saved[0]?.routes).toEqual([
      stale,
      { address: '10.0.0.7', port: 22, usesJumpHost: false },
    ]);
  });

  it('adds the routes a twin is missing', async () => {
    const env = makeEnv({ outcomes: [{ succeeds: PAIRED_RESULT }] });
    env.store.submit(CODES.bootstrap);
    await env.store.pair();
    const saved = env.catalog.saved[0];
    if (saved) env.catalog.update({ ...saved, routes: [] });

    env.store.rescan();
    env.store.submit(CODES.bootstrap);
    await env.store.pair();

    expect(env.catalog.saved).toHaveLength(1);
    expect(env.catalog.saved[0]?.routes).toEqual([
      { address: '10.0.0.7', port: 22, usesJumpHost: false },
    ]);
  });
});
