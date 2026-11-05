import { MemoryStorage, SettingsStore } from '@openagentspocket/core';
import { OverlayHost, ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createDemoConsoleStore } from '@/console/demo';
import { ConsoleStoreProvider } from '@/console/hooks';
import { fakeAuthenticator } from '@/settings/authenticator';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { DetailUiProvider, DockSlotView } from '../detailUi';
import { TerminalSurface } from './TerminalSurface';

const mockPush = jest.fn();
let mockClipboard = '';
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-clipboard', () => ({ getStringAsync: async () => mockClipboard }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

async function mountLive() {
  const store = createDemoConsoleStore();
  const settings = new SettingsStore(new MemoryStorage());
  await render(
    <ThemeProvider themeId="indigo">
      <SettingsProvider store={settings} authenticator={fakeAuthenticator(null)}>
        <ConsoleStoreProvider store={store}>
          <DetailUiProvider hostId="demo" paneId="p2">
            <TerminalSurface hostId="demo" paneId="p2" />
            <DockSlotView />
          </DetailUiProvider>
          <OverlayHost />
        </ConsoleStoreProvider>
      </SettingsProvider>
    </ThemeProvider>,
  );
  const slot = await screen.findByTestId('terminal-slot');
  await fireEvent(slot, 'layout', { nativeEvent: { layout: { width: 400, height: 300 } } });
  await waitFor(() =>
    expect(screen.getByTestId('terminal-slot-screen').props.children).toContain('$ '),
  );
  return screen;
}

const screenText = () => String(screen.getByTestId('terminal-slot-screen').props.children);

describe('terminal keys', () => {
  it('sends the Esc key as the escape byte', async () => {
    await mountLive();
    await fireEvent.press(screen.getByTestId('toolbar-escape'));
    await waitFor(() => expect(screenText()).toContain('^['));
  });

  it('sends a D-pad arrow as its escape sequence', async () => {
    await mountLive();
    await fireEvent.press(screen.getByTestId('toolbar-dPad'));
    await fireEvent.press(await screen.findByTestId('dpad-up'));
    await waitFor(() => expect(screenText()).toContain('^[[A'));
  });

  it('turns an armed Ctrl plus a typed letter into a control byte', async () => {
    await mountLive();
    await fireEvent.press(screen.getByTestId('toolbar-control'));
    await fireEvent.changeText(screen.getByTestId('terminal-slot-input'), 'c');
    await waitFor(() => expect(screenText()).toContain('^C'));
  });

  it('sends a full-keyboard key with its dock modifiers', async () => {
    await mountLive();
    await fireEvent.press(screen.getByTestId('toolbar-keyboard'));
    await fireEvent.press(await screen.findByTestId('key-mod-control'));
    await fireEvent.press(screen.getByTestId('key-char-d'));
    await waitFor(() => expect(screenText()).toContain('^D'));
  });

  it('reviews a multiline paste before it is sent', async () => {
    mockClipboard = 'one\rtwo';
    await mountLive();
    await fireEvent.press(screen.getByTestId('toolbar-more'));
    await fireEvent.press(await screen.findByLabelText('Paste'));
    const confirm = await screen.findByTestId('paste-confirm');
    expect(screenText()).not.toContain('two');
    await fireEvent.press(confirm);
    await waitFor(() => expect(screenText()).toContain('two'));
  });
});
