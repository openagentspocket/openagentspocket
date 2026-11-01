import { describe, expect, it } from 'vitest';
import {
  PairingCancelledError,
  PairingCeremonyError,
  type PairingCeremonyFailure,
  type PairingStep,
} from './ceremony';
import type { PairingCode } from './code';
import type { PairingCancellation, PairingDeviceKey } from './connector';
import { type ScriptedCandidate, ScriptedSSH, scriptedDeviceKey } from './scripted-ssh';
import { createSSHPairingConnector } from './ssh-connector';

const PINNED = 'SHA256:6+jncNdibsG2cqvfoLApGrO8CvIwAEMzsB+IilOs8tg';
const OTHER_KEY = 'SHA256:BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc';
const DEVICE = scriptedDeviceKey();
const OK_LINE = `HERDR-ENROLL:OK:${DEVICE.fingerprint}\n`;
const HOST = '10.0.0.7';

function code(over: Partial<PairingCode> = {}): PairingCode {
  return {
    addresses: [HOST],
    port: 22,
    username: 'lin',
    hostKeyFingerprint: PINNED,
    bootstrap: { seed: new Uint8Array(32).fill(1), expiresAt: 1_753_305_600 },
    endpoint: null,
    ...over,
  };
}

const pinnedHost = (over: ScriptedCandidate = {}): ScriptedCandidate => ({
  hostKey: PINNED,
  enroll: { respond: OK_LINE },
  ...over,
});

async function run(
  candidates: Record<string, ScriptedCandidate>,
  pairing: PairingCode = code(),
  options: {
    deviceKey?: PairingDeviceKey;
    cancellation?: PairingCancellation;
    identifiesTailscaleSSH?: (banner: string | null) => boolean;
  } = {},
) {
  const ssh = new ScriptedSSH(candidates);
  const steps: PairingStep[] = [];
  const connector = createSSHPairingConnector({
    dial: ssh.dial,
    deviceKeyComment: 'agentico-test',
    ...(options.identifiesTailscaleSSH && {
      identifiesTailscaleSSH: options.identifiesTailscaleSSH,
    }),
  });
  try {
    const result = await connector.pair(
      pairing,
      options.deviceKey ?? DEVICE,
      (step) => steps.push(step),
      options.cancellation,
    );
    return { ssh, steps, result, error: null };
  } catch (error) {
    return { ssh, steps, result: null, error };
  }
}

function failureOf(error: unknown): PairingCeremonyFailure | null {
  return error instanceof PairingCeremonyError ? error.failure : null;
}

describe('SSH pairing connector: success', () => {
  it('fails over dead and foreign candidates, enrolls the Device Key and verifies', async () => {
    const pairing = code({ addresses: ['192.0.2.1', '192.0.2.2', HOST] });
    const { ssh, steps, result } = await run(
      { '192.0.2.2': { hostKey: OTHER_KEY }, [HOST]: pinnedHost() },
      pairing,
    );

    expect(result).toEqual({
      address: HOST,
      port: 22,
      username: 'lin',
      hostKeyFingerprint: PINNED,
    });
    expect(steps).toEqual(['reach', 'enroll', 'verify']);
    // The foreign host key is never authenticated against.
    expect(ssh.ops('auth')).toEqual([`${HOST} bootstrap`, `${HOST} device`]);
    expect(ssh.bootstrapSeeds).toEqual([pairing.bootstrap?.seed]);
    expect(ssh.ops('exec')).toEqual([`${HOST} agentico-enroll`]);
    expect(ssh.enrollmentInputs).toEqual([`${DEVICE.authorizedKeysLine('agentico-test')}\n`]);
    // Every opened connection is closed.
    expect(ssh.ops('close')).toEqual(['192.0.2.2', HOST, HOST]);
  });

  it('verifies a config-only code with the existing Device Key directly', async () => {
    const { ssh, steps, result } = await run(
      { [HOST]: pinnedHost({ banner: 'SSH-2.0-Tailscale' }) },
      code({ bootstrap: null }),
    );
    expect(result?.address).toBe(HOST);
    expect(steps).toEqual(['reach', 'verify']);
    expect(ssh.ops('auth')).toEqual([`${HOST} device`]);
    expect(ssh.ops('exec')).toEqual([]);
  });

  it('pairs through another candidate when one is Tailscale SSH', async () => {
    const { result } = await run(
      { '100.64.0.1': pinnedHost({ banner: 'SSH-2.0-Tailscale' }), [HOST]: pinnedHost() },
      code({ addresses: ['100.64.0.1', HOST] }),
    );
    expect(result?.address).toBe(HOST);
  });

  it('fails over when authentication breaks for a reason other than rejection', async () => {
    const { result } = await run(
      { '192.0.2.9': pinnedHost({ bootstrapAuth: 'timedOut' }), [HOST]: pinnedHost() },
      code({ addresses: ['192.0.2.9', HOST] }),
    );
    expect(result?.address).toBe(HOST);
  });
});

describe('SSH pairing connector: reach and authenticate', () => {
  it('maps dead candidates to hostUnreachable', async () => {
    const { steps, error } = await run({}, code({ addresses: ['127.0.0.1'] }));
    expect(failureOf(error)?.kind).toBe('hostUnreachable');
    expect(steps).toEqual(['reach']);
  });

  it('never authenticates against a host whose key differs from the pin', async () => {
    const { ssh, error } = await run({ [HOST]: pinnedHost({ hostKey: OTHER_KEY }) });
    const failure = failureOf(error);
    expect(failure?.kind).toBe('hostUnreachable');
    expect(failure?.kind === 'hostUnreachable' && failure.detail).toContain(
      'not the pinned host key',
    );
    expect(ssh.ops('auth')).toEqual([]);
  });

  it('refuses Tailscale SSH before the pin is compared or anything authenticates', async () => {
    // The banner is OpenSSH's, the recognizer is injected (as the e2e suite does).
    const { ssh, steps, error } = await run(
      { [HOST]: pinnedHost({ hostKey: OTHER_KEY }) },
      code(),
      { identifiesTailscaleSSH: () => true },
    );
    expect(failureOf(error)).toEqual({ kind: 'tailscaleSSH', addresses: [HOST], port: 22 });
    expect(steps).toEqual(['reach']);
    expect(ssh.ops('auth')).toEqual([]);
    expect(ssh.seenBanners).toEqual(['SSH-2.0-OpenSSH_9.9']);
  });

  it('rejects the Tailscale SSH banner with the default recognizer', async () => {
    const { ssh, error } = await run({ [HOST]: pinnedHost({ banner: 'SSH-2.0-Tailscale' }) });
    expect(failureOf(error)?.kind).toBe('tailscaleSSH');
    expect(ssh.ops('auth')).toEqual([]);
    expect(ssh.ops('close')).toEqual([HOST]);
  });

  it('stops failover at the authenticate step when the pinned Host rejects the Bootstrap Key', async () => {
    const { ssh, steps, error } = await run(
      { [HOST]: pinnedHost({ bootstrapAuth: 'authenticationFailed' }), '10.0.0.8': pinnedHost() },
      code({ addresses: [HOST, '10.0.0.8'] }),
    );
    expect(failureOf(error)).toEqual({ kind: 'bootstrapRejected' });
    expect(steps).toEqual(['reach']);
    expect(ssh.ops('dial')).toEqual([HOST]);
  });

  it('reports a config-only Device Key rejection as a verify failure', async () => {
    const { error } = await run(
      { [HOST]: pinnedHost({ deviceAuth: 'authenticationFailed' }) },
      code({ bootstrap: null }),
    );
    expect(failureOf(error)?.kind).toBe('verificationFailed');
  });
});

describe('SSH pairing connector: enroll', () => {
  it.each([
    ['expired', 'HERDR-ENROLL:ERR:expired\n', 'expired'],
    ['unknown pairing', 'HERDR-ENROLL:ERR:unknown_pairing\n', 'unknownPairing'],
  ] as const)('surfaces the %s refusal at the enroll step', async (_, respond, refusal) => {
    const { steps, error } = await run({ [HOST]: pinnedHost({ enroll: { respond } }) });
    expect(failureOf(error)).toEqual({ kind: 'enrollmentRefused', refusal: { kind: refusal } });
    expect(steps).toEqual(['reach', 'enroll']);
  });

  it('keeps the enroll taxonomy on a timeout', async () => {
    const { error } = await run({ [HOST]: pinnedHost({ enroll: { fail: 'timedOut' } }) });
    expect(failureOf(error)).toEqual({
      kind: 'enrollmentFailed',
      detail: 'the Enrollment exchange timed out',
    });
  });

  it.each([
    ['the entrypoint exits silently', { fail: 'unexpectedEOF' } as const],
    ['the answer has no newline', { respond: `HERDR-ENROLL:OK:${DEVICE.fingerprint}` }],
  ])('reports unanswered when %s', async (_, enroll) => {
    const { ssh, error } = await run({ [HOST]: pinnedHost({ enroll }) });
    expect(failureOf(error)).toEqual({ kind: 'enrollmentUnanswered' });
    expect(ssh.ops('close')).toEqual([HOST]);
  });

  it.each([
    ['an oversized response line', { fail: 'other' } as const, ''],
    ['login-shell noise', { respond: 'welcome to fish\n' }, 'unexpected accept response'],
    [
      'a different enrolled key',
      { respond: 'HERDR-ENROLL:OK:SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n' },
      'different key',
    ],
  ])('fails Enrollment on %s', async (_, enroll, detail) => {
    const { ssh, error } = await run({ [HOST]: pinnedHost({ enroll }) });
    const failure = failureOf(error);
    expect(failure?.kind).toBe('enrollmentFailed');
    expect(failure?.kind === 'enrollmentFailed' && failure.detail).toContain(detail);
    expect(ssh.ops('auth')).toEqual([`${HOST} bootstrap`]);
  });

  it('refuses to submit a Device Key line that is not one bounded line', async () => {
    const { ssh, error } = await run({ [HOST]: pinnedHost() }, code(), {
      deviceKey: scriptedDeviceKey(undefined, 'ssh-ed25519 AAAA\nsecond-line'),
    });
    expect(failureOf(error)?.kind).toBe('enrollmentFailed');
    expect(ssh.ops('exec')).toEqual([]);
  });

  it('keeps cancellation a cancellation', async () => {
    const { error } = await run({ [HOST]: pinnedHost({ enroll: { fail: 'cancelled' } }) });
    expect(error).toBeInstanceOf(PairingCancelledError);
  });
});

describe('SSH pairing connector: verify', () => {
  it('rejects an Enrollment claim that did not persist the key', async () => {
    const { steps, error } = await run({
      [HOST]: pinnedHost({ deviceAuth: 'authenticationFailed' }),
    });
    expect(failureOf(error)?.kind).toBe('verificationFailed');
    expect(steps).toEqual(['reach', 'enroll', 'verify']);
  });

  it('fails verification when the host key changes mid-ceremony', async () => {
    const { ssh, error } = await run({ [HOST]: pinnedHost({ laterHostKey: OTHER_KEY }) });
    expect(failureOf(error)?.kind).toBe('verificationFailed');
    expect(ssh.ops('auth')).toEqual([`${HOST} bootstrap`]);
  });

  it('stops before verifying once cancelled', async () => {
    const cancellation = { aborted: false };
    const ssh = new ScriptedSSH({ [HOST]: pinnedHost() });
    const connector = createSSHPairingConnector({ dial: ssh.dial });
    const steps: PairingStep[] = [];
    const pairing = connector.pair(
      code(),
      DEVICE,
      (step) => {
        steps.push(step);
        if (step === 'enroll') cancellation.aborted = true;
      },
      cancellation,
    );
    await expect(pairing).rejects.toBeInstanceOf(PairingCancelledError);
    expect(steps).toEqual(['reach', 'enroll']);
    expect(ssh.ops('dial')).toEqual([HOST]);
  });
});
