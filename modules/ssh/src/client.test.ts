import { describe, expect, it } from 'vitest';
import type { NativeSshBridge, StreamCloseEvent, StreamDataEvent } from './bridge';
import { fromBase64, toBase64, utf8Decode, utf8Encode } from './bytes';
import { createSshClient, DEFAULT_MAX_RESPONSE_BYTES } from './client';
import type { SshError } from './errors';
import { stagingPath } from './sftp';

type Call = [string, ...unknown[]];

/** A scripted native bridge: records calls, answers from `answers`, emits stream events. */
function scriptedBridge(answers: Record<string, (...args: unknown[]) => unknown> = {}) {
  const calls: Call[] = [];
  const listeners: Record<string, ((event: never) => void)[]> = {};
  const defaults: Record<string, (...args: unknown[]) => unknown> = {
    connect: () => ({
      sessionId: 'ssh-1',
      hostKeyAlgorithm: 'ssh-ed25519',
      hostKeyFingerprint: 'SHA256:good',
      hostKey: '',
      serverIdentification: 'SSH-2.0-OpenSSH_9.9',
    }),
    openPty: () => 'stream-1',
    openStreamLocal: () => 'stream-2',
    sftpOpen: () => 'sftp-1',
  };
  const bridge = new Proxy(
    {},
    {
      get: (_target, name: string) => {
        if (name === 'addListener') {
          return (event: string, listener: (event: never) => void) => {
            listeners[event] = [...(listeners[event] ?? []), listener];
            return { remove: () => {} };
          };
        }
        if (name === 'then') return undefined;
        return async (...args: unknown[]) => {
          calls.push([name, ...args]);
          const answer = answers[name] ?? defaults[name];
          return answer ? answer(...args) : undefined;
        };
      },
    },
  ) as NativeSshBridge;
  const emit = (
    event: 'onStreamData' | 'onStreamClose',
    payload: StreamDataEvent | StreamCloseEvent,
  ) => {
    for (const listener of listeners[event] ?? []) listener(payload as never);
  };
  const names = () => calls.map(([name]) => name);
  return { bridge, calls, emit, names };
}

const options = { host: '127.0.0.1', port: 22, username: 'u', keyAlias: 'device' };
const rejectCode = (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (error: SshError) => error.code,
  );

describe('connect and the Host Key policy', () => {
  it('refuses a mismatched pin before authenticating and drops the connection', async () => {
    const { bridge, names } = scriptedBridge();
    const code = await rejectCode(
      createSshClient(bridge).connect({ ...options, pinnedHostKey: 'SHA256:other' }),
    );
    expect(code).toBe('hostKeyMismatch');
    expect(names()).toEqual(['connect', 'disconnect']);
  });

  it('asks on first contact and stops when the user rejects', async () => {
    const { bridge, names } = scriptedBridge();
    const seen: string[] = [];
    const code = await rejectCode(
      createSshClient(bridge).connect({
        ...options,
        confirmHostKey: (key) => {
          seen.push(key.fingerprint);
          return false;
        },
      }),
    );
    expect(code).toBe('hostKeyRejected');
    expect(seen).toEqual(['SHA256:good']);
    expect(names()).not.toContain('authenticate');
  });

  it('authenticates with the device key alias once the pin matches', async () => {
    const { bridge, calls } = scriptedBridge();
    const session = await createSshClient(bridge).connect({
      ...options,
      pinnedHostKey: 'SHA256:good',
    });
    expect(session.hostKey).toEqual({ algorithm: 'ssh-ed25519', fingerprint: 'SHA256:good' });
    expect(calls.find(([name]) => name === 'authenticate')?.slice(1, 4)).toEqual([
      'ssh-1',
      'u',
      'device',
    ]);
  });

  it('maps native failures to codes and disconnects a failed login', async () => {
    const { bridge, names } = scriptedBridge({
      authenticate: () => {
        throw Object.assign(new Error('denied'), { code: 'authenticationFailed' });
      },
    });
    expect(await rejectCode(createSshClient(bridge).connect(options))).toBe('authenticationFailed');
    expect(names()).toContain('disconnect');
  });
});

describe('requests and streams', () => {
  it('sends streamlocal requests as base64 with the 1 MiB default bound', async () => {
    const { bridge, calls } = scriptedBridge({
      exchangeStreamLocal: () => toBase64(utf8Encode('{"id":"1","result":{}}\n')),
    });
    const session = await createSshClient(bridge).connect(options);
    const response = await session.exchangeStreamLocal('/sock', utf8Encode('{"id":"1"}\n'));
    const call = calls.find(([name]) => name === 'exchangeStreamLocal');
    expect(utf8Decode(fromBase64(call?.[3] as string))).toBe('{"id":"1"}\n');
    expect(call?.[4]).toBe(DEFAULT_MAX_RESPONSE_BYTES);
    expect(utf8Decode(response)).toContain('"result"');
  });

  it('starts reading only at the first data listener and routes events by id', async () => {
    const { bridge, emit, names } = scriptedBridge();
    const session = await createSshClient(bridge).connect(options);
    const pty = await session.openPty({ cols: 80, rows: 24 });
    const other = await session.openStreamLocal('/sock');
    expect(names()).not.toContain('startStream');

    const received: string[] = [];
    pty.onData((data) => received.push(utf8Decode(data)));
    expect(names()).toContain('startStream');
    emit('onStreamData', { streamId: 'stream-1', data: toBase64(utf8Encode('ok')) });
    emit('onStreamData', { streamId: 'stream-2', data: toBase64(utf8Encode('not mine')) });
    expect(received).toEqual(['ok']);
    expect(other.id).toBe('stream-2');
  });

  it('reports a close once, with the failure code and the PTY exit status', async () => {
    const { bridge, emit } = scriptedBridge();
    const session = await createSshClient(bridge).connect(options);
    const pty = await session.openPty({ cols: 80, rows: 24 });
    const reasons: (string | undefined)[] = [];
    pty.onClose((reason) => reasons.push(reason));
    emit('onStreamClose', { streamId: 'stream-1', reason: null, exitStatus: 3 });
    emit('onStreamClose', { streamId: 'stream-1', reason: 'channelFailed', exitStatus: null });
    expect(reasons).toEqual([undefined]);
    expect(pty.exitStatus).toBe(3);
    expect(await rejectCode(pty.write(utf8Encode('x')))).toBe('closed');
  });
});

describe('sftp', () => {
  it('stages a replacing write next to the target and renames over it', async () => {
    const { bridge, calls } = scriptedBridge();
    const sftp = await (await createSshClient(bridge).connect(options)).sftp();
    await sftp.write('/home/u/notes.md', utf8Encode('hi'), { replace: true });
    const write = calls.find(([name]) => name === 'sftpWrite');
    const rename = calls.find(([name]) => name === 'sftpRename');
    expect(String(write?.[2]).startsWith('/home/u/.notes.md.agentico-')).toBe(true);
    expect(rename?.slice(2, 5)).toEqual([write?.[2], '/home/u/notes.md', true]);
  });

  it('removes the staged file when the rename fails', async () => {
    const { bridge, names } = scriptedBridge({
      sftpRename: () => {
        throw Object.assign(new Error('x'), { code: 'sftpFailure' });
      },
    });
    const sftp = await (await createSshClient(bridge).connect(options)).sftp();
    expect(await rejectCode(sftp.write('/a/b', utf8Encode('x'), { replace: true }))).toBe(
      'sftpFailure',
    );
    expect(names()).toContain('sftpUnlink');
  });

  it('removes the staged file when the write fails', async () => {
    const { bridge, calls, names } = scriptedBridge({
      sftpWrite: () => {
        throw Object.assign(new Error('x'), { code: 'sftpFailure' });
      },
    });
    const sftp = await (await createSshClient(bridge).connect(options)).sftp();
    expect(await rejectCode(sftp.write('/a/b', utf8Encode('x'), { replace: true }))).toBe(
      'sftpFailure',
    );
    const write = calls.find(([name]) => name === 'sftpWrite');
    const unlink = calls.find(([name]) => name === 'sftpUnlink');
    expect(String(write?.[2]).startsWith('/a/.b.agentico-')).toBe(true);
    expect(unlink?.[2]).toBe(write?.[2]);
    expect(names()).not.toContain('sftpRename');
  });

  it('maps listing kinds and keeps a missing directory as null', async () => {
    const { bridge } = scriptedBridge({
      sftpList: (_id, path) =>
        path === '/missing'
          ? null
          : {
              entries: [
                { name: 'd', kind: 'directory', size: 0, modifiedAt: 1 },
                { name: 'f', kind: 'weird', size: 3, modifiedAt: null },
              ],
              truncated: false,
              scanIncomplete: false,
            },
    });
    const sftp = await (await createSshClient(bridge).connect(options)).sftp();
    const listing = await sftp.list('/home');
    expect(listing?.entries.map((e) => [e.name, e.kind, e.isDirectory])).toEqual([
      ['d', 'directory', true],
      ['f', null, false],
    ]);
    expect(await sftp.list('/missing')).toBeNull();
  });

  it('names staging files as hidden siblings', () => {
    expect(stagingPath('/x/y.txt', 'n')).toBe('/x/.y.txt.agentico-n.tmp');
    expect(stagingPath('y.txt', 'n')).toBe('.y.txt.agentico-n.tmp');
  });
});
