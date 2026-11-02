import { describe, expect, it } from 'vitest';
import { PreviewConnection } from './connection';
import { nothingAnsweredDetail } from './failure';
import { DEBIAN_SS, probeOutput } from './fixtures';
import {
  createSessionHost,
  mapSessionError,
  type PortSession,
  SessionTunnel,
} from './session-host';

class FakePortSession implements PortSession {
  connected = true;
  forwards: { host: string; port: number; closed: boolean }[] = [];
  channels: { host: string; port: number }[] = [];
  openError: Error | null = null;
  disconnects = 0;

  async isConnected() {
    return this.connected;
  }
  async disconnect() {
    this.connected = false;
    this.disconnects += 1;
  }
  exec: PortSession['exec'] = async (_command, options) => {
    const text = new TextDecoder().decode(options.input);
    const nonce = /__AGENTICO_PORTS_([0-9a-f]+)__/.exec(text)?.[1] ?? '';
    return {
      exitCode: 0,
      stdout: probeOutput('Linux', [['ss', DEBIAN_SS, 0]], { nonce }),
      stderr: '',
    };
  };
  async forwardLocal(host: string, port: number) {
    const forward = { host, port, closed: false };
    this.forwards.push(forward);
    return {
      localPort: 49152 + this.forwards.length,
      close: async () => {
        forward.closed = true;
      },
    };
  }
  async openTcp(host: string, port: number) {
    if (this.openError) throw this.openError;
    this.channels.push({ host, port });
    return { close: async () => undefined };
  }
}

function sshError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

function setup() {
  const sessions: FakePortSession[] = [];
  const connection = new PreviewConnection<FakePortSession>(async () => {
    const session = new FakePortSession();
    sessions.push(session);
    return session;
  });
  return { sessions, connection };
}

describe('PreviewConnection', () => {
  it('shares one dial between concurrent callers and redials a lost link', async () => {
    const { sessions, connection } = setup();
    const [a, b] = await Promise.all([connection.session(), connection.session()]);
    expect(a).toBe(b);
    expect(sessions).toHaveLength(1);

    a.connected = false;
    const again = await connection.session();
    expect(again).not.toBe(a);
    expect(sessions).toHaveLength(2);
  });

  it('disconnect keeps it usable and close ends it for good', async () => {
    const { sessions, connection } = setup();
    const first = await connection.session();
    await connection.disconnect();
    expect(first.disconnects).toBe(1);
    expect(await connection.session()).not.toBe(first);
    await connection.close();
    await expect(connection.session()).rejects.toMatchObject({ error: { kind: 'cancelled' } });
    expect(sessions[1]?.disconnects).toBe(1);
  });

  it('drops a dial that finished after a disconnect', async () => {
    let release: (session: FakePortSession) => void = () => undefined;
    const connection = new PreviewConnection<FakePortSession>(
      () => new Promise((resolve) => (release = resolve)),
    );
    const pending = connection.session();
    await connection.disconnect();
    const late = new FakePortSession();
    release(late);
    await expect(pending).rejects.toMatchObject({ error: { kind: 'cancelled' } });
    expect(late.disconnects).toBe(1);
  });
});

describe('session host', () => {
  it('lists ports through the session exec', async () => {
    const { connection } = setup();
    const report = await createSessionHost(connection).listListeningPorts();
    expect(report.ports.some((port) => port.port === 5173)).toBe(true);
  });

  it('forwards the checked loopback address and closes the forward on stop', async () => {
    const { sessions, connection } = setup();
    const host = createSessionHost(connection);
    const tunnel = host.makeTunnel({ kind: 'loopbackV6', port: 3000 });
    const endpoint = await tunnel.start();
    expect(endpoint.url).toBe(`http://127.0.0.1:${endpoint.localPort}/`);
    expect(sessions[0]?.forwards[0]).toMatchObject({ host: '::1', port: 3000 });
    // Starting again reuses the forward.
    expect(await tunnel.start()).toEqual(endpoint);
    expect(sessions[0]?.forwards).toHaveLength(1);
    await tunnel.stop();
    expect(sessions[0]?.forwards[0]?.closed).toBe(true);
  });

  it('refuses an address the SSH layer would refuse, before any channel', async () => {
    const { sessions, connection } = setup();
    const tunnel = new SessionTunnel(connection, {
      kind: 'hostAddress',
      address: '8.8.8.8',
      port: 80,
    });
    await expect(tunnel.start()).rejects.toMatchObject({ error: { kind: 'channelFailed' } });
    expect(sessions).toHaveLength(0);
  });

  it('explains a failed page by opening one channel', async () => {
    const { sessions, connection } = setup();
    const tunnel = new SessionTunnel(connection, { kind: 'loopbackV4', port: 3000 });
    expect(await tunnel.lastFailure()).toBeNull();
    await tunnel.start();
    expect(await tunnel.lastFailure()).toBeNull();
    expect(sessions[0]?.channels).toEqual([{ host: '127.0.0.1', port: 3000 }]);

    const session = sessions[0];
    if (!session) throw new Error('no session');
    session.openError = sshError('targetUnreachable');
    expect(await tunnel.lastFailure()).toEqual({
      kind: 'channelFailed',
      detail: nothingAnsweredDetail(3000),
    });
    session.openError = sshError('forwardingDenied');
    expect(await tunnel.lastFailure()).toEqual({ kind: 'tcpForwardingUnavailable' });
    // A slow link says nothing about the page.
    session.openError = sshError('timedOut');
    expect(await tunnel.lastFailure()).toBeNull();
  });

  it('maps SSH error codes to transport errors', () => {
    expect(mapSessionError(sshError('forwardingDenied'), 80)).toEqual({
      kind: 'tcpForwardingUnavailable',
    });
    expect(mapSessionError(sshError('timedOut'), 80)).toEqual({ kind: 'timedOut' });
    expect(mapSessionError(sshError('connectionFailed'), 80).kind).toBe('sshUnreachable');
    expect(mapSessionError(new Error('boom'), 80)).toEqual({
      kind: 'channelFailed',
      detail: 'boom',
    });
  });
});
