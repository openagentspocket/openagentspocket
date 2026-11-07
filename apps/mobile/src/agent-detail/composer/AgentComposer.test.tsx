import { ComposerRegistry, FakeClock, MemoryStorage } from '@openagentspocket/core';
import { ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
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
async function renderDetail(
  paneId: string,
  storage = new MemoryStorage(),
  surface?: 'chat' | 'terminal',
) {
  const registry = new ComposerRegistry({ storage, clock: new FakeClock() });
  const store = createDemoConsoleStore();
  await render(
    <ThemeProvider themeId="indigo">
      <TestSettings>
        <ConsoleStoreProvider store={store}>
          <ComposerRegistryProvider registry={registry}>
            <AgentDetailScreen
              hostId="demo"
              paneId={paneId}
              storage={storage}
              surface={surface}
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
    await renderDetail('p2');
    await waitFor(() => expect(screen.getByTestId('composer-input')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('composer-input'), 'Fix the tests');
    await waitFor(() =>
      expect(screen.getByTestId('composer-input').props.value).toBe('Fix the tests'),
    );
    await fireEvent.press(screen.getByTestId('composer-send'));
    await waitFor(() => expect(screen.getByTestId('composer-input').props.value).toBe(''));
  });

  it('saves the draft under its Agent so a rebuilt screen finds it', async () => {
    const { storage } = await renderDetail('p2');
    await waitFor(() => expect(screen.getByTestId('composer-input')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('composer-input'), 'half a thought');
    await waitFor(() => expect(storage.getString('composer.draft.demo/p2')).toBe('half a thought'));
    expect(storage.getString('composer.draft.demo/p1')).toBeUndefined();
  });

  it('offers Stop for a working Agent with a blank draft and Send once text is typed', async () => {
    await renderDetail('p2');
    await waitFor(() => expect(screen.getByTestId('composer-stop')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('composer-input'), 'queue this');
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeTruthy());
    expect(screen.queryByTestId('composer-stop')).toBeNull();
  });

  it('refuses a Chat send to a Blocked Agent and keeps the draft', async () => {
    await renderDetail('p1');
    await waitFor(() => expect(screen.getByTestId('composer-input')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('composer-input'), 'n');
    await waitFor(() => expect(screen.getByTestId('composer-input').props.value).toBe('n'));
    await fireEvent.press(screen.getByTestId('composer-send'));
    await waitFor(() => expect(screen.getByTestId('composer-notice')).toBeTruthy());
    expect(screen.getByTestId('composer-input').props.value).toBe('n');
  });

  it('opens the + menu with the attachments and Add Image goes to the photo picker', async () => {
    await renderDetail('p2');
    await waitFor(() => expect(screen.getByTestId('composer-add')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('composer-add'));
    await waitFor(() => expect(screen.getByTestId('action-menu-add-image')).toBeTruthy());
    expect(screen.getByTestId('action-menu-add-file')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('action-menu-add-image'));
    await waitFor(() => expect(pickPhoto).toHaveBeenCalledTimes(1));
  });

  it('opens the ... menu with the session tools and the lifecycle, Close Agent last', async () => {
    await renderDetail('p2');
    await waitFor(() => expect(screen.getByTestId('composer-input')).toBeTruthy());
    // Folded to one line, the Composer shows "..." once it is open.
    expect(screen.queryByTestId('composer-more')).toBeNull();
    await fireEvent(screen.getByTestId('composer-input'), 'focus');
    await waitFor(() => expect(screen.getByTestId('composer-more')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('composer-more'));
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

  it('leaves the keyboard up after a Chat send', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    await renderDetail('p2');
    await waitFor(() => expect(screen.getByTestId('composer-input')).toBeTruthy());
    await fireEvent(screen.getByTestId('composer-input'), 'focus');
    await fireEvent.changeText(screen.getByTestId('composer-input'), 'hello');
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('composer-send'));
    await waitFor(() => expect(screen.getByTestId('composer-input').props.value).toBe(''));
    expect(dismiss).not.toHaveBeenCalled();
    expect(screen.getByTestId('composer-more')).toBeTruthy();
  });

  describe('on the terminal', () => {
    const openTerminal = async () => {
      await renderDetail('p2', new MemoryStorage(), 'terminal');
      await waitFor(() => expect(screen.getByTestId('composer-input')).toBeTruthy());
    };

    it('stays on one line until focused, and folds back on leaving', async () => {
      await openTerminal();
      expect(screen.queryByTestId('composer-more')).toBeNull();
      expect(screen.queryByTestId('composer-bar-toggle')).toBeNull();
      await fireEvent(screen.getByTestId('composer-input'), 'focus');
      await waitFor(() => expect(screen.getByTestId('composer-more')).toBeTruthy());
      expect(screen.getByTestId('composer-bar-toggle')).toBeTruthy();
      await fireEvent(screen.getByTestId('composer-input'), 'blur');
      await waitFor(() => expect(screen.queryByTestId('composer-more')).toBeNull());
    });

    it('folds back and drops the keyboard after sending', async () => {
      const dismiss = jest.spyOn(Keyboard, 'dismiss');
      await openTerminal();
      await fireEvent(screen.getByTestId('composer-input'), 'focus');
      await fireEvent.changeText(screen.getByTestId('composer-input'), 'ls');
      await waitFor(() => expect(screen.getByTestId('composer-more')).toBeTruthy());
      await waitFor(() => expect(screen.getByTestId('composer-send')).toBeTruthy());
      await fireEvent.press(screen.getByTestId('composer-send'));
      await waitFor(() => expect(screen.queryByTestId('composer-more')).toBeNull());
      expect(dismiss).toHaveBeenCalled();
    });
  });
});
