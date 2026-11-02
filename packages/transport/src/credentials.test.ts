import { type TransportError, TransportFailure } from '@openagentspocket/core';
import type { SshCredential } from 'agentico-ssh';
import { describe, expect, it } from 'vitest';
import { connectTransport } from './connect';
import { fakeSsh, reply, settingsFor } from './test-helpers';

const echo = (_socket: string, request: Uint8Array) => reply(request, { type: 'ok' });
async function failure(promise: Promise<unknown>): Promise<TransportError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TransportFailure) return error.error;
    throw error;
  }
  throw new Error('expected a failure');
}

const PEM = '-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----';

describe('connectTransport credentials', () => {
  it('authenticates with a password that is read only after the Host Key was accepted', async () => {
    const ssh = await fakeSsh(echo, { passwords: { dev: 'secret' } });
    const order: string[] = [];
    const settings = settingsFor({
      keyAlias: undefined,
      credential: async (): Promise<SshCredential> => {
        order.push('credential');
        return { kind: 'password', password: 'secret' };
      },
    });
    const transport = await connectTransport(ssh, settings);
    expect(await transport.isConnected()).toBe(true);
    expect(order).toEqual(['credential']);
    expect(ssh.credentials.map((credential) => credential.kind)).toEqual(['password']);
  });

  it('reports a wrong password as an authentication failure', async () => {
    const ssh = await fakeSsh(echo, { passwords: { dev: 'secret' } });
    const settings = settingsFor({
      keyAlias: undefined,
      credential: { kind: 'password', password: 'nope' },
    });
    expect((await failure(connectTransport(ssh, settings))).kind).toBe('authenticationFailed');
  });

  it('reads an unusable RSA key as a corrupt RSA identity', async () => {
    const ssh = await fakeSsh(echo);
    const settings = settingsFor({
      keyAlias: undefined,
      credential: { kind: 'rsaKey', privateKey: 'garbage' },
    });
    expect((await failure(connectTransport(ssh, settings))).kind).toBe('rsaKeyCorrupt');
  });

  it('connects with a readable RSA key', async () => {
    const ssh = await fakeSsh(echo, { rsaKeys: [PEM] });
    const settings = settingsFor({
      keyAlias: undefined,
      credential: { kind: 'rsaKey', privateKey: PEM },
    });
    await connectTransport(ssh, settings);
    expect(ssh.credentials.map((credential) => credential.kind)).toEqual(['rsaKey']);
  });
});
