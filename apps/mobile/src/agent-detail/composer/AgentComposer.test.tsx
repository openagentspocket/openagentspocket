import { ComposerRegistry, FakeClock, MemoryStorage } from '@openagentspocket/core';
import { ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createDemoConsoleStore } from '@/console/demo';
import { ConsoleStoreProvider } from '@/console/hooks';
import { pickPhoto } from '@/files/pickers';
import { TestSettings } from '@/settings/TestSettings';
import { AgentDetailScreen } from '../AgentDetailScreen';
import { ComposerRegistryProvider } from './composerContext';

jest.mock('@/files/pickers', () => ({
  pickPhoto: jest.fn(async () => null),
  pickDocument: jest.fn(async () => null),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));

function renderDetail(paneId: string, storage = new MemoryStorage()) {
  const registry = new ComposerRegistry({ storage, clock: new FakeClock() });
  const store = createDemoConsoleStore();
  render(
    <ThemeProvider themeId="indigo">
      <TestSettings>
        <ConsoleStoreProvider store={store}>
          <ComposerRegistryProvider registry={registry}>
            <AgentDetailScreen
              hostId="demo"
              paneId={paneId}
              storage={storage}
              onSwitch={jest.fn()}
            />
          </ComposerRegistryProvider>
        </ConsoleStoreProvider>
      </TestSettings>
    </ThemeProvider>,
  );
  return { storage, registry };
}

describe('AgentComposerBar', () => {
  it('keeps a typed draft and sends it, clearing the input', async () => {
    renderDetail('p2');
    await waitFor(() => expect(screen.getByTestId('composer-input')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('composer-input'), 'Fix the tests');
    await waitFor(() =>
      expect(screen.getByTestId('composer-input').props.value).toBe('Fix the tests'),
    );
    fireEvent.press(screen.getByTestId('composer-send'));
    await waitFor(() => expect(screen.getByTestId('composer-input').props.value).toBe(''));
  });

  it('saves the draft under its Agent so a rebuilt screen finds it', async () => {
    const { storage } = renderDetail('p2');
    await waitFor(() => expect(screen.getByTestId('composer-input')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('composer-input'), 'half a thought');
    await waitFor(() => expect(storage.getString('composer.draft.demo/p2')).toBe('half a thought'));
    expect(storage.getString('composer.draft.demo/p1')).toBeUndefined();
  });

  it('offers Stop for a working Agent with a blank draft and Send once text is typed', async () => {
    renderDetail('p2');
    await waitFor(() => expect(screen.getByTestId('composer-stop')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('composer-input'), 'queue this');
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeTruthy());
    expect(screen.queryByTestId('composer-stop')).toBeNull();
  });

  it('refuses a Chat send to a Blocked Agent and keeps the draft', async () => {
    renderDetail('p1');
    await waitFor(() => expect(screen.getByTestId('composer-input')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('composer-input'), 'n');
    await waitFor(() => expect(screen.getByTestId('composer-input').props.value).toBe('n'));
    fireEvent.press(screen.getByTestId('composer-send'));
    await waitFor(() => expect(screen.getByTestId('composer-notice')).toBeTruthy());
    expect(screen.getByTestId('composer-input').props.value).toBe('n');
  });

  it('opens the + menu with the attachments and Add Image goes to the photo picker', async () => {
    renderDetail('p2');
    await waitFor(() => expect(screen.getByTestId('composer-add')).toBeTruthy());
    fireEvent.press(screen.getByTestId('composer-add'));
    await waitFor(() => expect(screen.getByTestId('action-menu-add-image')).toBeTruthy());
    expect(screen.getByTestId('action-menu-add-file')).toBeTruthy();
    fireEvent.press(screen.getByTestId('action-menu-add-image'));
    await waitFor(() => expect(pickPhoto).toHaveBeenCalledTimes(1));
  });

  it('opens the ... menu with the session tools and the lifecycle, Close Agent last', async () => {
    renderDetail('p2');
    await waitFor(() => expect(screen.getByTestId('composer-input')).toBeTruthy());
    // Folded to one line, the Composer shows "..." once it is open.
    expect(screen.queryByTestId('composer-more')).toBeNull();
    fireEvent(screen.getByTestId('composer-input'), 'focus');
    await waitFor(() => expect(screen.getByTestId('composer-more')).toBeTruthy());
    fireEvent.press(screen.getByTestId('composer-more'));
    await waitFor(() => expect(screen.getByTestId('action-menu-show-terminal')).toBeTruthy());
    for (const key of [
      'back',
      'changes',
      'new-agent',
      'skills',
      'snippets',
      'rename-agent',
      'close',
    ]) {
      expect(screen.getByTestId(`action-menu-${key}`)).toBeTruthy();
    }
  });
});
