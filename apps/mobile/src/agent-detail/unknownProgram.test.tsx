import { MemoryStorage, SettingsStore } from '@openagentspocket/core';
import { OverlayHost, ThemeProvider } from '@openagentspocket/ui';
import { render, screen, waitFor } from '@testing-library/react-native';
import { createDemoConsoleStore, DemoConsoleTransport } from '../console/demo';
import { ConsoleStoreProvider } from '../console/hooks';
import { fakeAuthenticator } from '../settings/authenticator';
import { SettingsProvider } from '../settings/SettingsProvider';
import { AgentDetailScreen } from './AgentDetailScreen';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-clipboard', () => ({ getStringAsync: async () => '' }));

const agent = (status: string) => ({
  pane: 'h1',
  program: 'madeup',
  status,
  workspace: 'home',
  title: 'Made Up',
  seq: 1,
});

/** Agents of a program Chat cannot read yet still open: their Terminal works. */
describe.each(['idle', 'working', 'blocked', 'done'])(
  'an Agent of an unknown program, %s',
  (status) => {
    it('opens without throwing', async () => {
      const store = createDemoConsoleStore(
        undefined,
        new DemoConsoleTransport([agent(status)] as never),
      );
      await render(
        <ThemeProvider themeId="indigo">
          <SettingsProvider
            store={new SettingsStore(new MemoryStorage())}
            authenticator={fakeAuthenticator(null)}
          >
            <ConsoleStoreProvider store={store}>
              <AgentDetailScreen
                hostId="demo"
                paneId="h1"
                storage={new MemoryStorage()}
                onSwitch={jest.fn()}
              />
              <OverlayHost />
            </ConsoleStoreProvider>
          </SettingsProvider>
        </ThemeProvider>,
      );
      await waitFor(() => expect(screen.getByTestId('agent-detail')).toBeTruthy());
      await waitFor(() => expect(screen.getByText('Conversation Not Readable')).toBeTruthy());
    });
  },
);
