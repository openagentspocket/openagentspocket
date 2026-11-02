import {
  type FileBrowserHost,
  HOME_COMMAND,
  type LocalFiles,
  SftpFileBrowserHost,
} from '@openagentspocket/core';
import { FakeSsh, utf8Encode } from 'agentico-ssh';
import { createContext, useContext } from 'react';

/** Where the file browser gets its Host: the Host's name and a way to reach its files. */
export interface FileBrowserSource {
  hostName: string;
  /** Open the browser here instead of at the Host's home. */
  startPath?: string;
  /** The sandbox for copies; the app's own storage when omitted. */
  local?: LocalFiles;
  createHost(local: LocalFiles): Promise<FileBrowserHost>;
}

const bytes = utf8Encode;
const at = (iso: string) => Date.parse(iso) / 1000;

/** An in-memory Host for Demo mode, until the app has live Host sessions to browse. */
export const demoFileSource: FileBrowserSource = {
  hostName: 'Demo',
  async createHost(local) {
    const home = '/home/demo';
    const ssh = new FakeSsh({
      files: {
        [`${home}/README.md`]: bytes('# Demo\n'),
        [`${home}/.env`]: bytes('TOKEN=demo\n'),
        [`${home}/projects/app/main.ts`]: bytes('export {};\n'),
        [`${home}/notes 2.txt`]: bytes('two'),
        [`${home}/notes 10.txt`]: bytes('ten'),
      },
      directories: [`${home}/Downloads`, `${home}/workspace`, `${home}/empty`],
      modified: {
        [`${home}/Downloads`]: at('2026-10-21T13:00:00Z'),
        [`${home}/workspace`]: at('2026-10-28T15:00:00Z'),
        [`${home}/empty`]: at('2026-10-02T08:30:00Z'),
        [`${home}/README.md`]: at('2026-10-17T09:00:00Z'),
        [`${home}/.env`]: at('2026-09-22T09:00:00Z'),
        [`${home}/notes 2.txt`]: at('2026-10-24T21:00:00Z'),
        [`${home}/notes 10.txt`]: at('2026-10-25T10:15:00Z'),
      },
      exec: {
        [HOME_COMMAND]: { exitCode: 0, stdout: `__AGENTICO_HOME__=${home}\n`, stderr: '' },
      },
    });
    await ssh.generateKey('demo');
    const session = await ssh.connect({
      host: 'demo',
      port: 22,
      username: 'demo',
      keyAlias: 'demo',
    });
    return new SftpFileBrowserHost(session, local);
  },
};

export const FileBrowserSourceContext = createContext<FileBrowserSource>(demoFileSource);

export const useFileBrowserSource = () => useContext(FileBrowserSourceContext);
