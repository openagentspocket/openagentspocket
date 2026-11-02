import type { PairingCode } from '@openagentspocket/core';
import {
  fromBase64,
  type SshCredential,
  type SshModule,
  type SshSession,
  toSshError,
} from 'agentico-ssh';
import { createModuleConnector, pairingDeviceKey } from '@/connections/sshPairing';
import { check, post } from './harnessIo';
import type { StepResult } from './sshHarness';

/**
 * The SSH module's authentication run (dev only): password, Bootstrap Key seed and RSA key
 * (three PEM formats) against the isolated sshd and the fixture's password server
 * (modules/ssh/scripts/auth-fixture.py), plus a full Bootstrap pairing ceremony.
 */
export interface AuthHarnessParams {
  host: string;
  /** The isolated sshd. */
  port: number;
  user: string;
  fixturePort: number;
  /** Host Key pin of the isolated sshd. */
  pin?: string;
  /** Loopback host the fixture HTTP server and password server answer on, from the app. */
  fixtureHost: string;
}

interface Fixture {
  password: { user: string; password: string; port: number; pin: string };
  rsa: Record<'pkcs1' | 'pkcs8' | 'openssh' | 'encrypted' | 'unauthorized', string>;
  seed: string;
}

export function authHarnessParams(
  query: Record<string, string | undefined>,
): AuthHarnessParams | null {
  const { host, user } = query;
  const port = Number(query.port);
  const fixturePort = Number(query.fport);
  if (!host || !user || !port || !fixturePort) return null;
  return {
    host,
    port,
    user,
    fixturePort,
    pin: query.pin?.replaceAll(' ', '+') || undefined,
    fixtureHost: query.fhost || '127.0.0.1',
  };
}

async function code(run: Promise<unknown>): Promise<string> {
  return run.then(
    () => 'connected',
    (error) => toSshError(error).code,
  );
}

export async function runSshAuthHarness(
  ssh: SshModule,
  params: AuthHarnessParams,
  onStep: (step: StepResult) => void,
): Promise<StepResult[]> {
  const results: StepResult[] = [];
  const step = async (name: string, run: () => Promise<string>) => {
    const started = Date.now();
    let result: StepResult;
    try {
      const detail = await run();
      result = { name, ok: true, ms: Date.now() - started, detail };
    } catch (error) {
      const e = toSshError(error);
      result = { name, ok: false, ms: Date.now() - started, detail: `${e.code}: ${e.message}` };
    }
    results.push(result);
    onStep(result);
    post(params.fixturePort, '/log', JSON.stringify(result)).catch(() => {});
  };

  const response = await fetch(`http://${params.fixtureHost}:${params.fixturePort}/cred`);
  const fixture = (await response.json()) as Fixture;
  const sshd = {
    host: params.host,
    port: params.port,
    username: params.user,
    pinnedHostKey: params.pin,
  };
  const viaSshd = (credential: SshCredential) => ssh.connect({ ...sshd, credential });
  const pwServer = {
    host: params.host,
    port: fixture.password.port,
    pinnedHostKey: fixture.password.pin,
  };
  const echoOk = async (session: SshSession) => {
    try {
      const result = await session.exec('echo ok');
      check(result.exitCode === 0 && result.stdout.trim() === 'ok', JSON.stringify(result));
      return `${session.hostKey.algorithm} ${result.stdout.trim()}`;
    } finally {
      await session.disconnect();
    }
  };

  await step('password: correct password, exec echo', async () =>
    echoOk(
      await ssh.connect({
        ...pwServer,
        username: fixture.password.user,
        credential: { kind: 'password', password: fixture.password.password },
      }),
    ),
  );
  await step('password: wrong password is authenticationFailed', async () => {
    const got = await code(
      ssh.connect({
        ...pwServer,
        username: fixture.password.user,
        credential: { kind: 'password', password: 'not-the-password' },
      }),
    );
    check(got === 'authenticationFailed', `got ${got}`);
    return got;
  });
  await step('seed: Bootstrap Key seed authenticates', async () =>
    echoOk(await viaSshd({ kind: 'bootstrapSeed', seed: fromBase64(fixture.seed) })),
  );
  await step('seed: unknown seed is authenticationFailed', async () => {
    const got = await code(viaSshd({ kind: 'bootstrapSeed', seed: new Uint8Array(32).fill(7) }));
    check(got === 'authenticationFailed', `got ${got}`);
    return got;
  });
  for (const format of ['pkcs1', 'pkcs8', 'openssh'] as const) {
    await step(`rsa: ${format} private key authenticates (rsa-sha2-512)`, async () =>
      echoOk(await viaSshd({ kind: 'rsaKey', privateKey: fixture.rsa[format] })),
    );
  }
  await step('rsa: an unauthorized key is authenticationFailed', async () => {
    const got = await code(viaSshd({ kind: 'rsaKey', privateKey: fixture.rsa.unauthorized }));
    check(got === 'authenticationFailed', `got ${got}`);
    return got;
  });
  await step('rsa: an encrypted key is keyEncrypted', async () => {
    const got = await code(viaSshd({ kind: 'rsaKey', privateKey: fixture.rsa.encrypted }));
    check(got === 'keyEncrypted', `got ${got}`);
    return got;
  });
  await step('rsa: garbage is keyInvalid', async () => {
    const got = await code(viaSshd({ kind: 'rsaKey', privateKey: 'not a key' }));
    check(got === 'keyInvalid', `got ${got}`);
    return got;
  });
  await step('credential resolved only after the Host Key was accepted', async () => {
    const order: string[] = [];
    const session = await ssh.connect({
      ...sshd,
      pinnedHostKey: undefined,
      confirmHostKey: () => {
        order.push('confirm');
        return true;
      },
      credential: () => {
        order.push('credential');
        return { kind: 'rsaKey', privateKey: fixture.rsa.pkcs1 };
      },
    });
    await session.disconnect();
    check(order.join() === 'confirm,credential', order.join());
    return order.join(' > ');
  });
  await step('pairing: Bootstrap ceremony enrolls the device key and verifies', async () => {
    const alias = 'auth-harness-device';
    const { publicKey } = await ssh.generateKey(alias);
    const pinned = params.pin ?? '';
    check(pinned.startsWith('SHA256:'), 'pass pin=SHA256:... for the pairing step');
    const paired: PairingCode = {
      addresses: [params.host],
      port: params.port,
      username: params.user,
      hostKeyFingerprint: pinned,
      bootstrap: { seed: fromBase64(fixture.seed), expiresAt: Math.floor(Date.now() / 1000) + 600 },
      endpoint: null,
    };
    const steps: string[] = [];
    const result = await createModuleConnector({ ssh, keyAlias: alias }).pair(
      paired,
      pairingDeviceKey(publicKey),
      (s) => steps.push(s),
    );
    const device = await ssh.connect({ ...sshd, keyAlias: alias });
    const detail = `${steps.join('>')} via ${result.address}; ${await echoOk(device)}`;
    check(steps.join() === 'reach,enroll,verify', `steps ${steps.join()}`);
    return detail;
  });

  post(params.fixturePort, '/report', JSON.stringify({ results })).catch(() => {});
  return results;
}
