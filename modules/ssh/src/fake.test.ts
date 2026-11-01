import { describe, expect, it } from 'vitest';
import { FakeSsh } from './fake';

async function connected(options = {}) {
  const ssh = new FakeSsh(options);
  await ssh.generateKey('main');
  const session = await ssh.connect({ host: 'h', port: 22, username: 'u', keyAlias: 'main' });
  return { ssh, session };
}

describe('FakeSsh', () => {
  it('refuses an unknown key alias', async () => {
    await expect(
      new FakeSsh().connect({ host: 'h', port: 22, username: 'u', keyAlias: 'nope' }),
    ).rejects.toThrow('unknown key');
  });

  it('rejects a mismatched pinned host key', async () => {
    const ssh = new FakeSsh({ hostKeyFingerprint: 'SHA256:a' });
    await ssh.generateKey('main');
    await expect(
      ssh.connect({
        host: 'h',
        port: 22,
        username: 'u',
        keyAlias: 'main',
        pinnedHostKey: 'SHA256:b',
      }),
    ).rejects.toThrow('mismatch');
  });

  it('runs canned exec results', async () => {
    const { session } = await connected({
      exec: { whoami: { exitCode: 0, stdout: 'u\n', stderr: '' } },
    });
    expect((await session.exec('whoami')).stdout).toBe('u\n');
  });

  it('delivers stream data and tracks pty resize', async () => {
    const { session } = await connected();
    const pty = await session.openPty({ cols: 80, rows: 24 });
    const received: number[] = [];
    pty.onData((data) => received.push(data.length));
    (session.streams[0] as unknown as { emit(d: Uint8Array): void }).emit(new Uint8Array(3));
    await pty.resize(100, 30);
    expect(received).toEqual([3]);
  });
});
