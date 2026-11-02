import { FakeSsh, type FakeSshOptions } from '../../../../modules/ssh/src/fake';
import { encodeUtf8 } from '../events/utf8';
import { FileBrowserDownloads } from './downloads';
import { FileBrowserError } from './errors';
import { FakeLocalFiles } from './fake-local';
import type { FileBrowserItem } from './item';
import { FilePreparer } from './preparer';
import { SftpFileBrowserHost, type SftpHostOptions } from './sftp-host';
import { FileBrowserStore } from './store';

export const HOME_COMMAND = `/bin/sh -c 'printf "__AGENTICO_HOME__=%s\\n" "$HOME"'`;
export const bytes = (text: string) => encodeUtf8(text);
export const text = (data: Uint8Array | undefined) =>
  data === undefined ? undefined : new TextDecoder().decode(data);

export async function connect(options: FakeSshOptions = {}) {
  const ssh = new FakeSsh({
    ...options,
    exec: {
      [HOME_COMMAND]: { exitCode: 0, stdout: '__AGENTICO_HOME__=/home/me\n', stderr: '' },
      ...options.exec,
    },
  });
  await ssh.generateKey('k');
  const session = await ssh.connect({ host: 'h', port: 22, username: 'me', keyAlias: 'k' });
  return session;
}

export async function setup(options: FakeSshOptions = {}, hostOptions: SftpHostOptions = {}) {
  const session = await connect(options);
  const local = new FakeLocalFiles();
  const host = new SftpFileBrowserHost(session, local, {
    token: () => 'abcd1234',
    ...hostOptions,
  });
  return { session, local, host };
}

export async function setupStore(
  options: FakeSshOptions = {},
  extras: {
    startPath?: string;
    makeHost?: (base: SftpFileBrowserHost) => SftpFileBrowserHost;
  } = {},
) {
  const base = await setup(options);
  const host = extras.makeHost?.(base.host) ?? base.host;
  const store = new FileBrowserStore({
    hostName: 'devbox',
    startPath: extras.startPath,
    host,
    local: base.local,
    downloads: new FileBrowserDownloads(base.local, 'browser-1'),
    preparer: new FilePreparer(base.local, { newId: () => 'rand' }),
  });
  return { ...base, store, host };
}

/** Lets promise chains started by the store settle. */
export async function settle(turns = 12) {
  for (let i = 0; i < turns; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

export const home = '/home/me';
export const tree = {
  files: { [`${home}/readme.md`]: bytes('hello'), [`${home}/proj/main.ts`]: bytes('x') },
  directories: [`${home}/empty`],
};

export const find = (items: readonly FileBrowserItem[], name: string) => {
  const item = items.find((candidate) => candidate.name === name);
  if (!item) throw new Error(`no ${name}`);
  return item;
};
export const noticeOf = (kind: ConstructorParameters<typeof FileBrowserError>[0]) =>
  new FileBrowserError(kind).text;
