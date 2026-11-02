import { describe, expect, it } from 'vitest';
import { utf8Decode, utf8Encode } from './bytes';
import type { SshError } from './errors';
import { FakeSsh, type FakeSshOptions } from './fake';

async function connected(options: FakeSshOptions = {}) {
  const ssh = new FakeSsh(options);
  await ssh.generateKey('main');
  const session = await ssh.connect({ host: 'h', port: 22, username: 'u', keyAlias: 'main' });
  return { ssh, session };
}

const code = (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (error: SshError) => error.code,
  );

describe('FakeSsh', () => {
  it('keeps one key per alias and refuses an unknown alias', async () => {
    const ssh = new FakeSsh();
    const first = await ssh.generateKey('main');
    expect(await ssh.generateKey('main')).toEqual(first);
    expect(await ssh.publicKey('other')).toBeNull();
    expect(await code(ssh.connect({ host: 'h', port: 22, username: 'u', keyAlias: 'nope' }))).toBe(
      'keyNotFound',
    );
  });

  it('applies the Host Key policy like the native client', async () => {
    const ssh = new FakeSsh({ hostKey: { algorithm: 'ssh-ed25519', fingerprint: 'SHA256:a' } });
    await ssh.generateKey('main');
    const base = { host: 'h', port: 22, username: 'u', keyAlias: 'main' };
    expect(await code(ssh.connect({ ...base, pinnedHostKey: 'SHA256:b' }))).toBe('hostKeyMismatch');
    expect(await code(ssh.connect({ ...base, confirmHostKey: () => false }))).toBe(
      'hostKeyRejected',
    );
    expect((await ssh.connect({ ...base, pinnedHostKey: 'SHA256:a' })).hostKey.fingerprint).toBe(
      'SHA256:a',
    );
  });

  it('runs canned exec results and bounds streamlocal responses', async () => {
    const { session } = await connected({
      exec: { whoami: { exitCode: 0, stdout: 'u\n', stderr: '' } },
      streamLocal: (_path, request) =>
        utf8Decode(request).includes('big') ? new Uint8Array(2_000_000) : utf8Encode('ok\n'),
    });
    expect((await session.exec('whoami')).stdout).toBe('u\n');
    expect(utf8Decode(await session.exchangeStreamLocal('/s', utf8Encode('ping')))).toBe('ok\n');
    expect(await code(session.exchangeStreamLocal('/s', utf8Encode('big')))).toBe(
      'responseTooLarge',
    );
  });

  it('delivers stream data, tracks pty resize and ends streams on disconnect', async () => {
    const { session } = await connected();
    const pty = await session.openPty({ cols: 80, rows: 24 });
    const received: number[] = [];
    const closed: (string | undefined)[] = [];
    pty.onData((data) => received.push(data.length));
    pty.onClose((reason) => closed.push(reason));
    (session as unknown as { streams: { emit(d: Uint8Array): void }[] }).streams[0]?.emit(
      new Uint8Array(3),
    );
    await pty.resize(100, 30);
    await session.disconnect();
    expect(received).toEqual([3]);
    expect(closed).toEqual(['disconnected']);
    expect(await code(session.exec('whoami'))).toBe('closed');
  });

  it('follows the native SFTP semantics', async () => {
    const { session } = await connected({ files: { '/h/a.txt': utf8Encode('abc') } });
    const sftp = await session.sftp();
    expect(await code(sftp.write('/h/a.txt', utf8Encode('x')))).toBe('sftpFailure');
    await sftp.write('/h/a.txt', utf8Encode('xyz'), { replace: true });
    expect(utf8Decode((await sftp.readRange('/h/a.txt', 1, 5)).data)).toBe('yz');
    await sftp.mkdir('/h/d');
    expect(await code(sftp.rename('/h/a.txt', '/h/d'))).toBe('sftpFailure');
    await sftp.rename('/h/a.txt', '/h/d/a.txt');
    expect(await code(sftp.rmdir('/h/d'))).toBe('sftpFailure');
    expect((await sftp.list('/h'))?.entries.map((e) => [e.name, e.isDirectory])).toEqual([
      ['d', true],
    ]);
    expect(await sftp.stat('/h/a.txt')).toBeNull();
    expect(await sftp.read('/h/missing')).toBeNull();
    await sftp.unlink('/h/d/a.txt');
    await sftp.rmdir('/h/d');
    expect(await sftp.list('/h/d')).toBeNull();
  });
});
