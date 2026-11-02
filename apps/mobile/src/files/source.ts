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
