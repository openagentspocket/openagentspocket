import {
  ATTACH_MARKER,
  agentPaneTarget,
  concatBytes,
  TransportFailure,
  terminalTarget,
} from '@openagentspocket/core';
import { type FakePty, utf8Decode, utf8Encode } from 'agentico-ssh';
import { describe, expect, it } from 'vitest';
import { connected, settle } from './test-helpers';

const request = { target: agentPaneTarget('pane-1'), takeover: false, cols: 80, rows: 24 };
const noSocket = () => new Uint8Array();

async function attached(overrides = {}) {
  const { transport, ssh } = await connected(noSocket, overrides);
  const session = await transport.attachTerminal(request);
  const pty = ssh.sessions[0]?.streams.at(-1) as FakePty;
  return { transport, ssh, session, pty };
}

const collect = (session: { output: AsyncIterable<Uint8Array> }) => {
  const chunks: string[] = [];
  const done = (async () => {
    for await (const bytes of session.output) chunks.push(utf8Decode(bytes));
  })();
  return { chunks, done };
};

const reasonOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof TransportFailure ? error.error.kind : 'other';
  }
};

describe('SshTransport.attachTerminal', () => {
  it('opens a PTY at the requested size running the handshake exec on the socket', async () => {
    const { pty } = await attached();
    expect(pty.size).toEqual({ cols: 80, rows: 24 });
  });

  it('gates the startup chatter, drops the probe, and relays keys and resizes', async () => {
    const { session, pty } = await attached();
    const { chunks, done } = collect(session);
    pty.emit(utf8Encode('Last login\r\n'));
    pty.emit(concatBytes([ATTACH_MARKER, utf8Encode('screen\x1b[?1016$p\x1b[c!')]));
    session.send(utf8Encode('ls\r'));
    session.resize(100, 30);
    await settle();
    expect(chunks.join('')).toBe('screen!');
    expect(pty.written.map(utf8Decode)).toEqual(['ls\r']);
    expect(pty.size).toEqual({ cols: 100, rows: 30 });
    await session.end();
    await done;
    expect(pty.closed).toBe(true);
  });

  it('refuses a second attach to the same target but not to another', async () => {
    const { transport, session } = await attached();
    expect(await reasonOf(transport.attachTerminal(request))).toBe('terminalChannelAlreadyOpen');
    const other = await transport.attachTerminal({ ...request, target: terminalTarget('t-1') });
    await other.end();
    await session.end();
    const again = await transport.attachTerminal(request);
    await again.end();
  });

  it('holds an attach slot while live and returns it when the session ends', async () => {
    const { transport, session } = await attached();
    expect(transport.admission.snapshot().attach).toBe(1);
    await session.end();
    expect(transport.admission.snapshot().attach).toBe(0);
  });

  it('reports a remote exit as an attach failure and frees the target', async () => {
    const { transport, session, pty } = await attached();
    const { done } = collect(session);
    pty.emit(concatBytes([ATTACH_MARKER, utf8Encode('herdr: no such pane\r\n')]));
    pty.exitStatus = 1;
    pty.end();
    expect(await reasonOf(done)).toBe('attachExited');
    expect(transport.admission.snapshot().attach).toBe(0);
    await (await transport.attachTerminal(request)).end();
  });

  it('maps exit 127 on the bare herdr to a missing binary', async () => {
    const { session, pty } = await attached();
    const { done } = collect(session);
    pty.exitStatus = 127;
    pty.end();
    expect(await reasonOf(done)).toBe('herdrBinaryNotFound');
  });

  it('maps a dropped connection to an unreachable Host and stops reusing it', async () => {
    const { transport, session, pty } = await attached();
    const { done } = collect(session);
    pty.end('connectionInvalidated');
    expect(await reasonOf(done)).toBe('sshUnreachable');
    expect(await transport.isConnected()).toBe(false);
  });

  it('refuses to attach on a closed transport', async () => {
    const { transport } = await connected(noSocket);
    await transport.close();
    expect(await reasonOf(transport.attachTerminal(request))).toBe('sshUnreachable');
    expect(transport.admission.snapshot().attach).toBe(0);
  });

  it('refuses an unquotable target without opening a channel', async () => {
    const { transport, ssh } = await connected(noSocket);
    const bad = { ...request, target: agentPaneTarget("a'b") };
    expect(await reasonOf(transport.attachTerminal(bad))).toBe('channelFailed');
    expect(ssh.sessions[0]?.streams).toHaveLength(0);
    expect(transport.admission.snapshot().attach).toBe(0);
  });
});
