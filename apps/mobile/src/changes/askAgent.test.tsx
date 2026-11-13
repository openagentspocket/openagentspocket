import {
  ChangesStore,
  type Clock,
  type ComposerPrompt,
  ComposerRegistry,
  commitRequestText,
  FakeClock,
  MemoryStorage,
  readDraft,
  type Text,
} from '@openagentspocket/core';
import { keysOf, setLocale, t } from '@openagentspocket/i18n';
import { ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ComposerRegistryProvider } from '@/agent-detail/composer/composerContext';
import { renderMessage } from '@/lib/renderText';
import { ChangesScreen } from './ChangesScreen';
import { DEMO_READ } from './demo';
import { releaseChangesStore, setChangesStoreFactory } from './registry';
import { changesTargetId } from './target';

const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ dismissTo: mockDismissTo, push: jest.fn() }),
}));

const clock: Clock = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  monotonicMs: () => Date.now(),
};

const AGENT = changesTargetId({ kind: 'agent', hostId: 'demo', paneId: 'p1' });
const DIRECTORY = changesTargetId({ kind: 'directory', hostId: 'demo', directory: '/work/app' });

function install(read = DEMO_READ) {
  setChangesStoreFactory(
    () => new ChangesStore({ directory: () => '/work/storefront', read: async () => read, clock }),
  );
}

async function renderChanges(agentId: string) {
  const storage = new MemoryStorage();
  const registry = new ComposerRegistry({ storage, clock: new FakeClock() });
  const prompt = jest.fn<ReturnType<ComposerPrompt>, Parameters<ComposerPrompt>>(async () => {});
  await render(
    <ThemeProvider themeId="indigo">
      <ComposerRegistryProvider registry={registry}>
        <ChangesScreen agentId={agentId} storage={storage} onOpenFile={() => {}} />
      </ComposerRegistryProvider>
    </ThemeProvider>,
  );
  return { storage, registry, prompt };
}

const keys = (text: Text): string[] => {
  if (typeof text === 'string') return [];
  if ('join' in text) return text.join.flatMap(keys);
  return [text.key, ...(text.args ?? []).flatMap(keys)];
};

afterEach(() => {
  releaseChangesStore(AGENT);
  releaseChangesStore(DIRECTORY);
  setChangesStoreFactory(undefined);
  mockDismissTo.mockClear();
  setLocale('en');
});

describe('Ask Agent on Changes', () => {
  it('every key of the requests exists in the app catalog', () => {
    const app = new Set(keysOf('app'));
    for (const kind of ['commit', 'pullRequest'] as const) {
      for (const key of keys(commitRequestText(DEMO_READ.changes, kind))) {
        expect(app.has(key as never)).toBe(true);
      }
    }
  });

  it.each(['en', 'es'] as const)(
    'menu titles fit beside their icon (about 17 characters; 15 with room): %s',
    async (locale) => {
      setLocale(locale);
      for (const key of ['Commit', 'Commit and PR', 'Open PR'] as const) {
        expect(Array.from(t(key)).length).toBeLessThanOrEqual(15);
      }
      install();
      await renderChanges(AGENT);
      await fireEvent.press(await screen.findByRole('button', { name: t('Ask Agent') }));
      // Drawn short, read out in full.
      expect(await screen.findByText(t('Commit and PR'))).toBeTruthy();
      expect(
        screen.getByRole('menuitem', { name: t('Commit and Open Pull Request') }),
      ).toBeTruthy();
      expect(screen.getByText(t('Commit'))).toBeTruthy();
    },
  );

  it('puts the request into the Agent draft, opens its Chat, and sends nothing', async () => {
    install();
    const { storage, registry, prompt } = await renderChanges(AGENT);
    const store = registry.composerFor({ key: 'demo/p1', target: 'p1', prompt, status: 'idle' });
    store.replaceDraft('typed first');
    await fireEvent.press(await screen.findByRole('button', { name: t('Ask Agent') }));
    await fireEvent.press(
      await screen.findByRole('menuitem', { name: t('Commit and Open Pull Request') }),
    );
    const request = renderMessage(commitRequestText(DEMO_READ.changes, 'pullRequest'));
    await waitFor(() => expect(store.getSnapshot().draft).toBe(`typed first\n\n${request}`));
    expect(readDraft(storage, 'demo/p1')).toBe(`typed first\n\n${request}`);
    expect(store.getSnapshot().messages).toEqual([]);
    expect(prompt).not.toHaveBeenCalled();
    expect(mockDismissTo).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/agent/[hostId]/[paneId]',
        params: expect.objectContaining({ hostId: 'demo', paneId: 'p1', surface: 'chat' }),
      }),
    );
  });

  it('with no live Composer the request waits in the saved draft', async () => {
    install();
    const { storage } = await renderChanges(AGENT);
    await fireEvent.press(await screen.findByRole('button', { name: t('Ask Agent') }));
    await fireEvent.press(await screen.findByRole('menuitem', { name: t('Commit Changes') }));
    const request = renderMessage(commitRequestText(DEMO_READ.changes, 'commit'));
    await waitFor(() => expect(readDraft(storage, 'demo/p1')).toBe(request));
  });

  it('a plain directory has no Agent to ask', async () => {
    install();
    await renderChanges(DIRECTORY);
    await screen.findByTestId('changes-header');
    expect(screen.queryByTestId('changes-ask-agent')).toBeNull();
  });

  it('a clean, pushed Checkout offers nothing to ask', async () => {
    const { changes } = DEMO_READ;
    install({
      ...DEMO_READ,
      changes: {
        ...changes,
        files: [],
        head: {
          ...changes.head,
          upstream: { name: 'origin/main', state: { kind: 'tracking', ahead: 0, behind: 0 } },
        },
      },
    });
    await renderChanges(AGENT);
    await screen.findByTestId('changes-header');
    expect(screen.queryByTestId('changes-ask-agent')).toBeNull();
  });
});
