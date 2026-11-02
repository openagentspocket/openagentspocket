import {
  decodePairingCode,
  PairingCeremonyError,
  type PairingCode,
  type PairingDeviceKey,
} from '@openagentspocket/core';
import { FakeSsh } from 'agentico-ssh';
import { createModuleConnector, pairingDeviceKey } from './sshPairing';
import { TrustPromptQueue } from './trustPrompt';
import { newUuid } from './uuid';

jest.mock('expo-secure-store', () => ({}));

const FINGERPRINT = 'SHA256:6+jncNdibsG2cqvfoLApGrO8CvIwAEMzsB+IilOs8tg';
const PUBLIC_LINE =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl';
const CONFIG_ONLY_CODE =
  'HERDR-PAIR:1:eyJhZGRycyI6WyIxOTIuMTY4LjEuNDIiXSwicG9ydCI6MjIsInVzZXIiOiJhZGEiLCJmcCI6IlNIQTI1Njo2K2puY05kaWJzRzJjcXZmb0xBcEdyTzhDdkl3QUVNenNCK0lpbE9zOHRnIn0';

function decoded(): PairingCode {
  const result = decodePairingCode(CONFIG_ONLY_CODE);
  if (!('code' in result)) throw new Error('fixture code must decode');
  return result.code;
}

async function deviceKey(ssh: FakeSsh): Promise<PairingDeviceKey> {
  await ssh.generateKey('pairing');
  ssh.keys.set('pairing', PUBLIC_LINE);
  return pairingDeviceKey(PUBLIC_LINE);
}

describe('ssh pairing connector', () => {
  it('reaches the pinned Host and verifies with the device key', async () => {
    const ssh = new FakeSsh({ hostKey: { algorithm: 'ssh-ed25519', fingerprint: FINGERPRINT } });
    const key = await deviceKey(ssh);
    const steps: string[] = [];
    const result = await createModuleConnector({ ssh, keyAlias: 'pairing' }).pair(
      decoded(),
      key,
      (step) => steps.push(step),
    );
    expect(result.address).toBe('192.168.1.42');
    expect(result.hostKeyFingerprint).toBe(FINGERPRINT);
    expect(steps).toContain('verify');
    expect(ssh.sessions.at(-1)?.connected).toBe(false);
  });

  it('enrolls the device key with the Bootstrap Key seed, then verifies with the device key', async () => {
    const seed = new Uint8Array(32).fill(9);
    const probe = await deviceKey(new FakeSsh());
    const ssh = new FakeSsh({
      hostKey: { algorithm: 'ssh-ed25519', fingerprint: FINGERPRINT },
      bootstrapSeeds: [seed],
      exec: {
        'agentico-enroll': {
          exitCode: 0,
          stdout: `HERDR-ENROLL:OK:${probe.fingerprint}\n`,
          stderr: '',
        },
      },
    });
    const key = await deviceKey(ssh);
    const steps: string[] = [];
    await createModuleConnector({ ssh, keyAlias: 'pairing' }).pair(
      { ...decoded(), bootstrap: { seed, expiresAt: 4_000_000_000 } },
      key,
      (step) => steps.push(step),
    );
    expect(steps).toEqual(['reach', 'enroll', 'verify']);
    expect(ssh.credentials.map((credential) => credential.kind)).toEqual([
      'bootstrapSeed',
      'deviceKey',
    ]);
  });

  it('reports a rejected Bootstrap Key as such', async () => {
    const ssh = new FakeSsh({
      hostKey: { algorithm: 'ssh-ed25519', fingerprint: FINGERPRINT },
      bootstrapSeeds: [new Uint8Array(32).fill(1)],
    });
    const key = await deviceKey(ssh);
    await expect(
      createModuleConnector({ ssh, keyAlias: 'pairing' }).pair(
        { ...decoded(), bootstrap: { seed: new Uint8Array(32).fill(2), expiresAt: 4_000_000_000 } },
        key,
        () => {},
      ),
    ).rejects.toMatchObject({ failure: { kind: 'bootstrapRejected' } });
  });

  it('never authenticates against a Host presenting another key', async () => {
    const ssh = new FakeSsh({
      hostKey: {
        algorithm: 'ssh-ed25519',
        fingerprint: 'SHA256:AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
      },
    });
    const key = await deviceKey(ssh);
    await expect(
      createModuleConnector({ ssh, keyAlias: 'pairing' }).pair(decoded(), key, () => {}),
    ).rejects.toBeInstanceOf(PairingCeremonyError);
    expect(ssh.sessions).toHaveLength(0);
  });

  it('derives the device key fingerprint from its public line', async () => {
    const key = await deviceKey(new FakeSsh());
    expect(key.fingerprint).toMatch(/^SHA256:/);
    expect(key.authorizedKeysLine('phone')).toMatch(/^ssh-ed25519 \S+ phone$/);
  });
});

describe('trust prompt queue', () => {
  it('asks one Host at a time', async () => {
    const open: (() => void)[] = [];
    let concurrent = 0;
    let peak = 0;
    const queue = new TrustPromptQueue(
      () =>
        new Promise<boolean>((resolve) => {
          concurrent += 1;
          peak = Math.max(peak, concurrent);
          open.push(() => {
            concurrent -= 1;
            resolve(true);
          });
        }),
    );
    const candidate = {
      host: 'a',
      port: 22,
      fingerprint: { digest: new Uint8Array(32), algorithm: 'x' },
    };
    const first = queue.confirm(candidate);
    const second = queue.confirm(candidate);
    await Promise.resolve();
    expect(open).toHaveLength(1);
    open[0]?.();
    await first;
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
    open[1]?.();
    expect(await second).toBe(true);
    expect(peak).toBe(1);
  });
});

describe('uuid', () => {
  it('makes distinct version 4 ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newUuid()));
    expect(ids.size).toBe(50);
    for (const id of ids)
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
