import { FakeLocalFiles, HOME_COMMAND, SftpFileBrowserHost } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { OverlayHost, ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { FakeSsh, utf8Encode } from 'agentico-ssh';
import { deliver } from './deliver';
import { FilesScreen } from './FilesScreen';
import type { FileBrowserSource } from './source';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));
jest.mock('./deliver', () => ({ deliver: jest.fn(async () => {}) }));
jest.mock('./pickers', () => ({ pickDocument: jest.fn(), pickPhoto: jest.fn() }));

const home = '/home/me';

function sourceWith(files: Record<string, string>, directories: string[] = []): FileBrowserSource {
  const local = new FakeLocalFiles();
  return {
    hostName: 'Devbox',
    local,
    async createHost() {
      const ssh = new FakeSsh({
        files: Object.fromEntries(
          Object.entries(files).map(([path, text]) => [path, utf8Encode(text)]),
        ),
        directories,
        exec: {
          [HOME_COMMAND]: { exitCode: 0, stdout: `__AGENTICO_HOME__=${home}\n`, stderr: '' },
        },
      });
      await ssh.generateKey('k');
      const session = await ssh.connect({ host: 'h', port: 22, username: 'me', keyAlias: 'k' });
      return new SftpFileBrowserHost(session, local);
    },
  };
}

const renderFiles = (source: FileBrowserSource) =>
  render(
    <ThemeProvider themeId="indigo">
      <FilesScreen source={source} />
      <OverlayHost />
    </ThemeProvider>,
  );

describe('FilesScreen', () => {
  beforeEach(() => jest.mocked(deliver).mockClear());

  it('lists the home folder, opens a folder and climbs back up', async () => {
    renderFiles(sourceWith({ [`${home}/proj/main.ts`]: 'x', [`${home}/readme.md`]: 'hi' }));
    await waitFor(() => expect(screen.getByTestId('file-proj')).toBeTruthy());
    expect(screen.getByTestId('file-readme.md')).toBeTruthy();
    fireEvent.press(screen.getByTestId('file-proj'));
    await waitFor(() => expect(screen.getByTestId('file-main.ts')).toBeTruthy());
    expect(screen.queryByTestId('file-readme.md')).toBeNull();
    fireEvent.press(screen.getByTestId('files-up'));
    await waitFor(() => expect(screen.getByTestId('file-readme.md')).toBeTruthy());
  });

  it('shows an empty folder as empty', async () => {
    renderFiles(sourceWith({}, [home, `${home}/empty`]));
    await waitFor(() => expect(screen.getByTestId('file-empty')).toBeTruthy());
    fireEvent.press(screen.getByTestId('file-empty'));
    await waitFor(() => expect(screen.getByText(t('Empty Folder'))).toBeTruthy());
  });

  it('asks before downloading a secret-looking file, then hands it to the system', async () => {
    renderFiles(sourceWith({ [`${home}/.env`]: 'TOKEN=1' }));
    await waitFor(() => expect(screen.getByTestId('file-.env')).toBeTruthy());
    fireEvent.press(screen.getByTestId('file-.env'));
    const confirmButton = await screen.findByText(t('Download'));
    expect(deliver).not.toHaveBeenCalled();
    fireEvent.press(confirmButton);
    await waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));
    expect(jest.mocked(deliver).mock.calls[0]?.[0]).toMatchObject({
      name: '.env',
      intent: 'preview',
    });
  });

  it('shows a failed listing with a way to retry', async () => {
    const source = sourceWith({}, [home]);
    const original = source.createHost.bind(source);
    source.createHost = async (local) => {
      const host = await original(local);
      host.list = async () => {
        throw new Error('boom');
      };
      return host;
    };
    renderFiles(source);
    await waitFor(() => expect(screen.getByText(t('Try Again'))).toBeTruthy());
  });
});
