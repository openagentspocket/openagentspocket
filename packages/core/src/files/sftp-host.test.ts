import { describe, expect, it } from 'vitest';
import { TransportFailure } from '../errors/transport-error';
import { CancelledError, createCancellation } from '../hosts/cancellation';
import { shellWord } from '../hosts/herdr-command-line';
import { FileBrowserError } from './errors';
import { bytes, connect, setup, text } from './fixture.test-util';
import { FILE_LIMITS } from './limits';
import type { TransferProgress } from './ports';
import { SftpFileBrowserHost } from './sftp-host';

const never = createCancellation().signal;
const noProgress = () => {};

async function failure(run: Promise<unknown>) {
  try {
    await run;
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('home and listing', () => {
  it('reads the home folder from the marker line, once', async () => {
    const { host } = await setup();
    expect(await host.homeDirectory()).toBe('/home/me');
    expect(await host.homeDirectory()).toBe('/home/me');
  });

  it('fails when the home probe returns no absolute path', async () => {
    const session = await connect({
      exec: {
        '/bin/sh -c \'printf "__AGENTICO_HOME__=%s\\n" "$HOME"\'': {
          exitCode: 0,
          stdout: 'noise\n',
          stderr: '',
        },
      },
    });
    const { FakeLocalFiles } = await import('./fake-local');
    const host = new SftpFileBrowserHost(session, new FakeLocalFiles());
    const error = await failure(host.homeDirectory());
    expect(error).toBeInstanceOf(TransportFailure);
  });

  it('lists a folder and refuses paths it cannot send', async () => {
    const { host } = await setup({
      files: { '/home/me/a.txt': bytes('a') },
      directories: ['/home/me/sub'],
    });
    const listing = await host.list('/home/me');
    expect(listing.entries.map((e) => [e.name, e.kind])).toEqual([
      ['a.txt', 'file'],
      ['sub', 'directory'],
    ]);
    expect(await failure(host.list('/home/../etc'))).toBeInstanceOf(TransportFailure);
    expect(await failure(host.list('/nope'))).toMatchObject({ kind: 'notFound' });
  });
});

describe('download', () => {
  it('copies every chunk and ends on a complete report', async () => {
    const data = new Uint8Array(FILE_LIMITS.downloadChunkBytes * 2 + 5).fill(7);
    const { host, local } = await setup({ files: { '/d/big.bin': data } });
    const reports: TransferProgress[] = [];
    await host.download(
      { path: '/d/big.bin', destination: 'local://x/big.bin', maximumBytes: data.length },
      (p) => reports.push(p),
      never,
    );
    expect(local.files.get('local://x/big.bin')?.length).toBe(data.length);
    expect(reports.at(-1)).toEqual({ transferredBytes: data.length, totalBytes: data.length });
  });

  it('refuses a folder, a missing file and a file above the cap before writing', async () => {
    const { host, local } = await setup({
      files: { '/d/f': bytes('12345') },
      directories: ['/d/sub'],
    });
    const request = (path: string, maximumBytes = 100) => ({
      path,
      destination: 'local://x/f',
      maximumBytes,
    });
    expect(await failure(host.download(request('/d/sub'), noProgress, never))).toMatchObject({
      kind: 'notAFile',
    });
    expect(await failure(host.download(request('/d/zz'), noProgress, never))).toMatchObject({
      kind: 'notFound',
    });
    expect(await failure(host.download(request('/d/f', 4), noProgress, never))).toMatchObject({
      kind: 'tooLarge',
    });
    expect(local.files.size).toBe(0);
  });

  it('leaves no partial copy when cancelled', async () => {
    const data = new Uint8Array(FILE_LIMITS.downloadChunkBytes * 3);
    const { host, local } = await setup({ files: { '/d/big.bin': data } });
    const cancellation = createCancellation();
    const run = host.download(
      { path: '/d/big.bin', destination: 'local://x/big.bin', maximumBytes: data.length },
      (p) => p.transferredBytes > 0 && cancellation.cancel(),
      cancellation.signal,
    );
    cancellation.cancel();
    expect(await failure(run)).toBeInstanceOf(CancelledError);
    expect(local.files.has('local://x/big.bin')).toBe(false);
  });

  it('fails a file that grows past the cap while it is read', async () => {
    const { session, local } = await setup({ files: { '/d/g': new Uint8Array(20) } });
    const sftp = await session.sftp();
    const lying = {
      exec: (command: string) => session.exec(command),
      sftp: async () => ({
        ...sftp,
        stat: async () => ({ kind: 'file' as const, size: 1, modifiedAt: 0 }),
      }),
    };
    const host = new SftpFileBrowserHost(lying, local);
    const request = { path: '/d/g', destination: 'local://x/g', maximumBytes: 10 };
    expect(await failure(host.download(request, noProgress, never))).toMatchObject({
      kind: 'tooLarge',
    });
    expect(local.files.has('local://x/g')).toBe(false);
  });
});

describe('upload', () => {
  const upload = (name: string, replacesExisting = false) => ({
    source: 'local://src/f',
    byteCount: 3,
    directory: '/d',
    name,
    replacesExisting,
  });

  it('writes through a part and renames it into place', async () => {
    const { host, local, session } = await setup({ directories: ['/d'] });
    local.put('local://src/f', bytes('abc'));
    const reports: TransferProgress[] = [];
    await host.upload(upload('new.txt'), (p) => reports.push(p), never);
    expect(text(session.files.get('/d/new.txt'))).toBe('abc');
    expect([...session.files.keys()].some((p) => p.endsWith('.part'))).toBe(false);
    expect(reports.at(-1)?.transferredBytes).toBe(3);
  });

  it('refuses a taken name unless replacing, and replaces atomically', async () => {
    const { host, local, session } = await setup({ files: { '/d/a.txt': bytes('old') } });
    local.put('local://src/f', bytes('abc'));
    expect(await failure(host.upload(upload('a.txt'), noProgress, never))).toMatchObject({
      kind: 'alreadyExists',
    });
    expect(text(session.files.get('/d/a.txt'))).toBe('old');
    await host.upload(upload('a.txt', true), noProgress, never);
    expect(text(session.files.get('/d/a.txt'))).toBe('abc');
  });

  it('never replaces a folder', async () => {
    const { host, local } = await setup({ directories: ['/d/sub'] });
    local.put('local://src/f', bytes('abc'));
    expect(await failure(host.upload(upload('sub', true), noProgress, never))).toMatchObject({
      kind: 'alreadyExists',
    });
  });

  it('rejects bad names, oversize files and a source that changed size', async () => {
    const { host, local } = await setup({ directories: ['/d'] });
    local.put('local://src/f', bytes('abc'));
    expect(await failure(host.upload(upload('a/b'), noProgress, never))).toMatchObject({
      kind: 'invalidName',
    });
    expect(
      await failure(
        host.upload({ ...upload('x'), byteCount: FILE_LIMITS.uploadBytes + 1 }, noProgress, never),
      ),
    ).toMatchObject({ kind: 'tooLarge' });
    expect(
      await failure(host.upload({ ...upload('x'), byteCount: 9 }, noProgress, never)),
    ).toMatchObject({
      kind: 'localStorageFailed',
    });
  });

  it('leaves no part behind when the upload is cancelled', async () => {
    const { host, local, session } = await setup({ directories: ['/d'] });
    local.put('local://src/f', bytes('abc'));
    const cancellation = createCancellation();
    cancellation.cancel();
    expect(await failure(host.upload(upload('x'), noProgress, cancellation.signal))).toBeInstanceOf(
      CancelledError,
    );
    expect([...session.files.keys()]).toEqual([]);
  });
});

describe('rename and delete', () => {
  it('renames, and says exists for a taken name', async () => {
    const { host, session } = await setup({ files: { '/d/a': bytes('1'), '/d/b': bytes('2') } });
    expect(await failure(host.rename('/d/a', 'b'))).toMatchObject({ kind: 'alreadyExists' });
    await host.rename('/d/a', 'c');
    expect(session.files.has('/d/c')).toBe(true);
    expect(session.files.has('/d/a')).toBe(false);
    expect(await failure(host.rename('/d/c', 'x/y'))).toMatchObject({ kind: 'invalidName' });
  });

  it('never touches system folders', async () => {
    const { host } = await setup({ directories: ['/etc'] });
    expect(await failure(host.rename('/etc', 'etc2'))).toMatchObject({ kind: 'protectedItem' });
    expect(await failure(host.delete('/etc', 'directory'))).toMatchObject({
      kind: 'protectedItem',
    });
  });

  it('deletes files and empty folders, and says when a folder is not empty', async () => {
    const { host, session } = await setup({
      files: { '/d/full/x': bytes('1'), '/d/f': bytes('2') },
      directories: ['/d/empty'],
    });
    await host.delete('/d/f', 'file');
    await host.delete('/d/empty', 'directory');
    expect(session.files.has('/d/f')).toBe(false);
    expect(session.directories.has('/d/empty')).toBe(false);
    const error = await failure(host.delete('/d/full', 'directory'));
    expect(error).toBeInstanceOf(FileBrowserError);
    expect(error).toMatchObject({ kind: 'directoryNotEmpty' });
  });
});

describe('ignored names', () => {
  const command = (dir: string) =>
    `GIT_OPTIONAL_LOCKS=0 git -c core.fsmonitor=false -C ${shellWord(dir)} check-ignore -z --stdin`;

  it('returns the asked names git reports, and treats exit 1 as none', async () => {
    const { host } = await setup({
      exec: {
        [command('/home/me/app')]: { exitCode: 0, stdout: './dist\0./other\0', stderr: '' },
        [command('/home/me/plain')]: { exitCode: 1, stdout: '', stderr: '' },
        [command('/home/me/nogit')]: { exitCode: 128, stdout: '', stderr: 'not a git repository' },
      },
    });
    expect([...(await host.ignoredNames('/home/me/app', ['src', 'dist']))]).toEqual(['dist']);
    expect((await host.ignoredNames('/home/me/plain', ['a'])).size).toBe(0);
    expect((await host.ignoredNames('/home/me/nogit', ['a'])).size).toBe(0);
    expect((await host.ignoredNames('/home/me/app', [])).size).toBe(0);
  });

  it('quotes the directory and runs through the git gate', async () => {
    let gated = 0;
    const { host } = await setup(
      { exec: { [command("/d/it's")]: { exitCode: 0, stdout: './a\0', stderr: '' } } },
      {
        gitGate: (run) => {
          gated++;
          return run();
        },
      },
    );
    expect([...(await host.ignoredNames("/d/it's", ['a']))]).toEqual(['a']);
    expect(gated).toBe(1);
  });
});
