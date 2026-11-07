import {
  type ComposerPrompt,
  ComposerRegistry,
  FakeClock,
  MemoryStorage,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
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
function renderDetail(
  paneId: string,
  storage = new MemoryStorage(),
  registry = new ComposerRegistry({ storage, clock: new FakeClock() }),
) {
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
  describe('an attachment standing in the Composer', () => {
    const attachment = { medium: 'file', name: 'notes.md', hostPath: '/tmp/a/notes.md' } as const;
    const seeded = (registry: ComposerRegistry, prompt: ComposerPrompt) =>
      registry.composerFor({ key: 'demo/p2', target: 'p2', prompt, status: 'working' });

    it('sits above an input that stays empty, and goes alone in place of Stop', async () => {
      const storage = new MemoryStorage();
      const registry = new ComposerRegistry({ storage, clock: new FakeClock() });
      const prompt = jest.fn(async () => {});
      seeded(registry, prompt).attach(attachment);
      renderDetail('p2', storage, registry);
      await waitFor(() => expect(screen.getByText('notes.md')).toBeTruthy());
      expect(screen.getByTestId('composer-input').props.value).toBe('');
      expect(screen.queryByTestId('composer-stop')).toBeNull();
      fireEvent.press(screen.getByTestId('composer-send'));
      await waitFor(() => expect(prompt).toHaveBeenCalled());
      expect(prompt.mock.calls[0]).toEqual([{ target: 'p2', text: '/tmp/a/notes.md ' }]);
      await waitFor(() => expect(screen.queryByText('notes.md')).toBeNull());
    });

    it('leaves the message when removed, with no text left behind', async () => {
      const storage = new MemoryStorage();
      const registry = new ComposerRegistry({ storage, clock: new FakeClock() });
      const store = seeded(
        registry,
        jest.fn(async () => {}),
      );
      store.attach(attachment);
      renderDetail('p2', storage, registry);
      await waitFor(() => expect(screen.getByText('notes.md')).toBeTruthy());
      fireEvent.press(screen.getByLabelText(t('Remove %@', 'notes.md')));
      await waitFor(() => expect(screen.queryByText('notes.md')).toBeNull());
      expect(store.getSnapshot().attachments).toEqual([]);
      expect(store.getSnapshot().draft).toBe('');
      await waitFor(() => expect(screen.getByTestId('composer-stop')).toBeTruthy());
    });
  });

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
