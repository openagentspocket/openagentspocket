import { FakeClock, type TransportError, TransportFailure } from '@openagentspocket/core';
import { FakeSsh, type HostKey, SshError, type SshModule } from 'agentico-ssh';
import { describe, expect, it } from 'vitest';
import { connectTransport } from './connect';
import { JUMP_LOCAL_HOST } from './jump';
import { directRoute, fakeSsh, policy, reply, settingsFor, settle } from './test-helpers';

const KEY_A: HostKey = {
  algorithm: 'ssh-ed25519',
  fingerprint: 'SHA256:AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
};
const KEY_B: HostKey = {
  algorithm: 'ssh-ed25519',
  fingerprint: 'SHA256:ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8',
};

const KEY_C: HostKey = {
  algorithm: 'ssh-ed25519',
  fingerprint: 'SHA256:QEFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaW1xdXl8',
};

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

/** Dispatches `connect` per host name, as separate machines would answer. */
function perHost(machines: Record<string, SshModule | SshError>): SshModule {
  const any = Object.values(machines).find((m): m is SshModule => !(m instanceof SshError));
  return {
    generateKey: (alias) => (any as SshModule).generateKey(alias),
    publicKey: (alias) => (any as SshModule).publicKey(alias),
    deleteKey: (alias) => (any as SshModule).deleteKey(alias),
    connect: async (options) => {
      const machine = machines[options.host];
      if (!machine) throw new SshError('connectionFailed', 'no such machine');
      if (machine instanceof SshError) throw machine;
      return machine.connect(options);
    },
  };
}

describe('connectTransport host key rules', () => {
  it('asks once on first contact, stores the key, and does not ask again', async () => {
    const ssh = await fakeSsh(echo, { hostKey: KEY_A });
    const settings = settingsFor();
    const first = await connectTransport(ssh, settings);
    expect(await first.isConnected()).toBe(true);
    await connectTransport(ssh, settings);
    expect((settings.hostKeyPolicy as ReturnType<typeof policy>).prompts).toBe(1);
  });

  it('refuses a changed key before authentication, whoever the user is', async () => {
    const settings = settingsFor();
    await connectTransport(await fakeSsh(echo, { hostKey: KEY_A }), settings);
    const other = await fakeSsh(echo, { hostKey: KEY_B, authorizedUsers: ['someone-else'] });
    const error = await failure(connectTransport(other, settings));
    expect(error.kind).toBe('hostKeyMismatch');
    expect(other.sessions).toHaveLength(0);
  });

  it('stores nothing when the user declines the first key', async () => {
    const declining = policy(() => false);
    const settings = settingsFor({ hostKeyPolicy: declining });
    const error = await failure(
      connectTransport(await fakeSsh(echo, { hostKey: KEY_A }), settings),
    );
    expect(error.kind).toBe('hostKeyRejected');
    expect(declining.knownHosts.fingerprints('host.test', 22)).toHaveLength(0);
  });

  it('trusts by Host id so every route must present the same key', async () => {
    const settings = settingsFor({
      hostKeyTrust: { kind: 'host', hostId: 'HOST-1' },
      routes: [directRoute('a.test', 'a')],
    });
    await connectTransport(await fakeSsh(echo, { hostKey: KEY_A }), settings);
    const sameHostOtherAddress = { ...settings, routes: [directRoute('b.test', 'b')] };
    const impostor = await fakeSsh(echo, { hostKey: KEY_B });
    expect((await failure(connectTransport(impostor, sameHostOtherAddress))).kind).toBe(
      'hostKeyMismatch',
    );
  });
});

describe('connectTransport outcomes', () => {
  it('maps a refused login to authenticationFailed', async () => {
    const ssh = await fakeSsh(echo, { authorizedUsers: ['nobody'] });
    expect((await failure(connectTransport(ssh, settingsFor()))).kind).toBe('authenticationFailed');
  });

  it('maps a missing device key to deviceKeyCorrupt', async () => {
    const ssh = new FakeSsh({ streamLocal: echo, hostKey: KEY_A });
    expect((await failure(connectTransport(ssh, settingsFor()))).kind).toBe('deviceKeyCorrupt');
  });

  it('reports the route that was reached', async () => {
    const { transport } = { transport: await connectTransport(await fakeSsh(echo), settingsFor()) };
    expect(transport.routeId).toBe('r1');
  });
});

describe('connectTransport through a Jump Host', () => {
  const jump = { host: 'j.test', port: 2222, username: 'jump' };
  const route = { ...directRoute('h.test', 'x'), jump };

  async function machines(target: HostKey = KEY_A) {
    const bastion = await fakeSsh(echo, { hostKey: KEY_B, authorizedUsers: ['jump'] });
    const host = await fakeSsh(echo, { hostKey: target });
    const dialed: string[] = [];
    const inner = perHost({ 'j.test': bastion, '127.0.0.1': host });
    const ssh: SshModule = {
      ...inner,
      connect: (options) => {
        dialed.push(`${options.username}@${options.host}:${options.port}`);
        return inner.connect(options);
      },
    };
    return { ssh, bastion, host, dialed };
  }

  it('reaches the Host through a forward on the jump session', async () => {
    const { ssh, dialed } = await machines();
    const settings = settingsFor({ routes: [route] });
    const transport = await connectTransport(ssh, settings);
    expect(await transport.isConnected()).toBe(true);
    expect(dialed[0]).toBe('jump@j.test:2222');
    expect(dialed[1]).toContain('@127.0.0.1:49152');
  });

  it('checks the Host by its own address, not the local forward', async () => {
    const first = await machines(KEY_A);
    const settings = settingsFor({ routes: [route] });
    await connectTransport(first.ssh, settings);

    const swapped = await machines(KEY_C);
    const error = await failure(connectTransport(swapped.ssh, settings));
    expect(error.kind).toBe('hostKeyMismatch');
    expect(swapped.host.sessions).toHaveLength(0);
    expect(await swapped.bastion.sessions[0]?.isConnected()).toBe(false);
  });

  it('reports a Jump Host that refuses as its own failure and never dials the Host', async () => {
    const { ssh, host } = await machines();
    const settings = settingsFor({ routes: [route] });
    await connectTransport(ssh, settings);
    const other = await fakeSsh(echo, { hostKey: KEY_C, authorizedUsers: ['jump'] });
    const before = host.sessions.length;
    const swapped = perHost({ 'j.test': other, '127.0.0.1': host });
    const error = await failure(connectTransport(swapped, settings));
    expect(error).toMatchObject({
      kind: 'jumpHostFailed',
      underlying: { kind: 'hostKeyMismatch' },
    });
    expect(host.sessions).toHaveLength(before);
  });

  it('closes both hops together, and the Host counts as lost with its jump', async () => {
    const { ssh, bastion, host } = await machines();
    const transport = await connectTransport(ssh, settingsFor({ routes: [route] }));
    await bastion.sessions[0]?.disconnect();
    expect(await transport.isConnected()).toBe(false);

    await transport.session.disconnect();
    expect(await host.sessions[0]?.isConnected()).toBe(false);
  });

  it('closes the jump session and its forward even when the Host refuses to disconnect', async () => {
    const { ssh, bastion } = await machines();
    const refusing: SshModule = {
      ...ssh,
      connect: async (options) => {
        const session = await ssh.connect(options);
        if (options.host !== JUMP_LOCAL_HOST) return session;
        return Object.assign(session, {
          disconnect: () => Promise.reject(new SshError('closed')),
        });
      },
    };
    const transport = await connectTransport(refusing, settingsFor({ routes: [route] }));

    await expect(transport.session.disconnect()).rejects.toBeInstanceOf(SshError);
    expect(await bastion.sessions[0]?.isConnected()).toBe(false);
  });
});

describe('connectTransport route race', () => {
  it('keeps the first route that verified the key and authenticates only there', async () => {
    const lan = await fakeSsh(echo, { hostKey: KEY_A });
    const wan = await fakeSsh(echo, { hostKey: KEY_A });
    const ssh = perHost({ 'lan.test': lan, 'wan.test': wan });
    const settings = settingsFor({
      routes: [directRoute('lan.test', 'lan'), directRoute('wan.test', 'wan')],
    });
    const transport = await connectTransport(ssh, settings);
    await settle();
    expect(lan.sessions.length + wan.sessions.length).toBe(1);
    expect(transport.routeId).toBe('lan');
  });

  it('falls through to the route that answers when the first is unreachable', async () => {
    const wan = await fakeSsh(echo, { hostKey: KEY_A });
    const ssh = perHost({
      'lan.test': new SshError('connectionFailed', 'refused'),
      'wan.test': wan,
    });
    const settings = settingsFor({
      routes: [directRoute('lan.test', 'lan'), directRoute('wan.test', 'wan')],
    });
    expect((await connectTransport(ssh, settings)).routeId).toBe('wan');
  });

  it('reports each route when none is reached', async () => {
    const ssh = perHost({
      'a.test': new SshError('connectionFailed', 'refused'),
      'b.test': new SshError('timedOut', 'slow'),
    });
    const settings = settingsFor({
      routes: [directRoute('a.test', 'a'), directRoute('b.test', 'b')],
      clock: new FakeClock(),
    });
    const error = await failure(connectTransport(ssh, settings));
    expect(error.kind).toBe('noRouteReached');
    if (error.kind !== 'noRouteReached') return;
    expect(error.failures.map((f) => [f.routeId, f.error.kind])).toEqual([
      ['a', 'sshUnreachable'],
      ['b', 'timedOut'],
    ]);
  });

  it('surfaces the claimant failure (bad login) instead of a route list', async () => {
    const a = await fakeSsh(echo, { hostKey: KEY_A, authorizedUsers: ['nobody'] });
    const b = await fakeSsh(echo, { hostKey: KEY_A, authorizedUsers: ['nobody'] });
    const settings = settingsFor({
      routes: [directRoute('a.test', 'a'), directRoute('b.test', 'b')],
    });
    const error = await failure(connectTransport(perHost({ 'a.test': a, 'b.test': b }), settings));
    expect(error.kind).toBe('authenticationFailed');
  });
});
