import { MemoryStorage, ScriptedTerminalSession, SettingsStore } from '@openagentspocket/core';
import { ThemeProvider } from '@openagentspocket/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ConsoleStoreProvider } from '@/console/hooks';
import type { ConsoleStore } from '@/console/store';
import { fakeAuthenticator } from '@/settings/authenticator';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { TerminalSurface } from './TerminalSurface';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-clipboard', () => ({ getStringAsync: async () => '' }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const bytes = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));
const screenText = () => String(screen.getByTestId('terminal-slot-screen').props.children ?? '');

/** A Console store whose Host hands out one PTY fake, as an idle shell would. */
function storeWith(pty: ScriptedTerminalSession): ConsoleStore {
  return {
    subscribe: () => () => undefined,
    transportGeneration: () => 1,
    withTerminalTransport: async (
      _hostId: string,
      operation: (transport: unknown, generation: number) => Promise<unknown>,
    ) => operation({ attachTerminal: async () => pty }, 1),
  } as unknown as ConsoleStore;
}

async function mount(pty: ScriptedTerminalSession) {
  await render(
    <ThemeProvider themeId="indigo">
      <SettingsProvider
        store={new SettingsStore(new MemoryStorage())}
        authenticator={fakeAuthenticator(null)}
      >
        <ConsoleStoreProvider store={storeWith(pty)}>
          <TerminalSurface hostId="h1" paneId="p1" />
        </ConsoleStoreProvider>
      </SettingsProvider>
    </ThemeProvider>,
  );
  const slot = await screen.findByTestId('terminal-slot');
  await fireEvent(slot, 'layout', { nativeEvent: { layout: { width: 400, height: 300 } } });
}

describe('terminal attach path', () => {
  it('paints what the PTY writes once the surface attached', async () => {
    const pty = new ScriptedTerminalSession();
    await mount(pty);
    await act(async () => pty.emit(bytes('user@box:~$ ')));
    await waitFor(() => expect(screenText()).toContain('user@box:~$'));
  });

  it('paints a prompt the shell wrote before the view finished laying out', async () => {
    const pty = new ScriptedTerminalSession();
    pty.emit(bytes('early prompt $ '));
    await mount(pty);
    await waitFor(() => expect(screenText()).toContain('early prompt'));
  });
});
