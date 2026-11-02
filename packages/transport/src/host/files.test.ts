import type { TransportFailure } from '@openagentspocket/core';
import type { FakeSession } from 'agentico-ssh';
import { describe, expect, it } from 'vitest';
import { DEFAULT_HOME_COMMAND } from '../settings';
import { connected } from '../test-helpers';
import { hostHomeDirectory } from './environment';
import { listDirectories, SessionHostFiles } from './remote-files';
import { cLocale } from './shell';
import { type StagingError, type StagingSource, stageAttachment } from './staging';

const ok = (stdout: string, exitCode = 0) => ({ exitCode, stdout, stderr: '' });

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a failure');
}

describe('staging', () => {
  const parent = '/tmp/agentico.AbCd1234';
  const stageExec = {
    [cLocale(
      `/bin/sh -c 'umask 077; directory=$(mktemp -d "\${TMPDIR:-/tmp}/agentico.XXXXXXXX") || exit 1; printf "__AGENTICO_STAGE_DIR__=%s\\n" "$directory"'`,
    )]: ok(`__AGENTICO_STAGE_DIR__=${parent}\n`),
  };
  const source = (bytes: Uint8Array, name = 'image.png'): StagingSource => ({
    byteCount: bytes.length,
    remoteFilename: name,
    read: async () => bytes,
  });

  it('stages bytes into a private folder and reports progress', async () => {
    const { transport, ssh } = await connected(
      () => new Uint8Array(),
      {},
      {
        exec: stageExec,
        directories: [parent],
      },
    );
    const progress: number[] = [];
    const path = await stageAttachment(transport, source(new Uint8Array([1, 2, 3])), {
      maxBytes: 100,
      token: () => 'abc',
      onProgress: (p) => progress.push(p.transferredBytes),
    });
    expect(path).toBe(`${parent}/stage-abc/image.png`);
    expect((ssh.sessions[0] as FakeSession).files.get(path)).toEqual(new Uint8Array([1, 2, 3]));
    expect((ssh.sessions[0] as FakeSession).files.has(`${path}.part`)).toBe(false);
    expect(progress).toEqual([0, 3]);
  });

  it('refuses an empty, oversized or mismatched source before touching the Host', async () => {
    const { transport } = await connected(() => new Uint8Array());
    for (const bad of [source(new Uint8Array()), source(new Uint8Array(101))]) {
      const thrown = (await failure(
        stageAttachment(transport, bad, { maxBytes: 100 }),
      )) as StagingError;
      expect(thrown.kind).toBe('invalidPreparedSource');
    }
  });

  it('fails when the Host cannot make a temporary directory', async () => {
    const { transport } = await connected(() => new Uint8Array());
    const thrown = (await failure(
      stageAttachment(transport, source(new Uint8Array([1])), { maxBytes: 100 }),
    )) as StagingError;
    expect(thrown.kind).toBe('remoteTemporaryDirectoryFailed');
    expect(thrown.isRetryable).toBe(false);
  });

  it('removes the part file when the final check fails', async () => {
    const { transport, ssh } = await connected(
      () => new Uint8Array(),
      {},
      {
        exec: stageExec,
        directories: [parent],
      },
    );
    const bytes = new Uint8Array([1, 2, 3]);
    const lying: StagingSource = {
      byteCount: 3,
      remoteFilename: 'a.txt',
      read: async () => bytes.subarray(0, 2),
    };
    const thrown = (await failure(
      stageAttachment(transport, lying, { maxBytes: 100, token: () => 'x' }),
    )) as StagingError;
    expect(thrown.kind).toBe('byteCountMismatch');
    expect([...(ssh.sessions[0] as FakeSession).files.keys()]).toEqual([]);
  });

  it('cancels between steps', async () => {
    const { transport } = await connected(
      () => new Uint8Array(),
      {},
      { exec: stageExec, directories: [parent] },
    );
    const signal = { aborted: true, addEventListener() {}, removeEventListener() {} };
    const thrown = (await failure(
      stageAttachment(transport, source(new Uint8Array([1])), { maxBytes: 100, signal }),
    )) as StagingError;
    expect(thrown.kind).toBe('cancelled');
    expect(thrown.isRetryable).toBe(true);
  });
});

describe('remote files', () => {
  const file = '/home/dev/.claude/projects/p/s.jsonl';
  const options = { files: { [file]: new Uint8Array([104, 105]) } };

  it('reads status, ranges and listings over one held channel', async () => {
    const { transport } = await connected(() => new Uint8Array(), {}, options);
    const files = new SessionHostFiles(transport);
    expect(await files.status(file)).toMatchObject({ kind: 'regular', size: 2 });
    expect(await files.status('/home/dev/missing')).toBeNull();
    expect(await files.read({ path: file, offset: 1, maxBytes: 10 })).toEqual({
      data: new Uint8Array([105]),
      length: 2,
    });
    const listing = await files.list({
      directory: '/home/dev/.claude/projects/p',
      kinds: ['regular'],
      maximumEntries: 5,
    });
    expect(listing?.entries).toEqual([{ name: 's.jsonl' }]);
    expect(transport.admission.snapshot().ordinarySession).toBe(1);
    await files.close();
    expect(transport.admission.snapshot().ordinarySession).toBe(0);
  });

  it('refuses unacceptable paths before any channel opens', async () => {
    const { transport } = await connected(() => new Uint8Array(), {}, options);
    const files = new SessionHostFiles(transport);
    for (const path of ['relative', '/a/../b', '/a/\u0000']) {
      const thrown = (await failure(files.status(path))) as TransportFailure;
      expect(thrown.error.kind).toBe('invalidDirectoryPath');
    }
    expect(transport.admission.snapshot().ordinarySession).toBe(0);
  });

  it('returns an idle channel to admission after 30 seconds', async () => {
    const { transport, settings } = await connected(() => new Uint8Array(), {}, options);
    const files = new SessionHostFiles(transport);
    await files.status(file);
    expect(transport.admission.snapshot().ordinarySession).toBe(1);
    (settings.clock as import('@openagentspocket/core').FakeClock).advance(30_000);
    await new Promise((resolve) => setImmediate(resolve));
    expect(transport.admission.snapshot().ordinarySession).toBe(0);
  });

  it('reads the home directory through the home probe', async () => {
    const { transport } = await connected(
      () => new Uint8Array(),
      {},
      {
        exec: { [`LC_ALL=C ${DEFAULT_HOME_COMMAND}`]: ok('__AGENTICO_HOME__=/home/dev\n') },
      },
    );
    expect(await hostHomeDirectory(transport)).toBe('/home/dev');
  });

  it('lists directories only, and validates the path first', async () => {
    const { transport } = await connected(
      () => new Uint8Array(),
      {},
      {
        directories: ['/srv', '/srv/a', '/srv/b'],
        files: { '/srv/file.txt': new Uint8Array([1]) },
      },
    );
    expect(await listDirectories(transport, '/srv')).toEqual({
      directories: ['a', 'b'],
      truncated: false,
    });
    for (const path of ['', 'relative', "/it's"]) {
      const thrown = (await failure(listDirectories(transport, path))) as TransportFailure;
      expect(thrown.error.kind).toBe('invalidDirectoryPath');
    }
    const missing = (await failure(listDirectories(transport, '/nope'))) as TransportFailure;
    expect(missing.error.kind).toBe('hostFileUnreadable');
  });
});
