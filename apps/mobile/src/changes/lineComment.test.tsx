import {
  type ChangedFile,
  ChangesStore,
  type Clock,
  type ComposerPrompt,
  ComposerRegistry,
  FakeClock,
  lineCommentText,
  MemoryStorage,
  parsePatchFiles,
  readDraft,
  type Text,
} from '@openagentspocket/core';
import { keysOf, t } from '@openagentspocket/i18n';
import { ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ComposerRegistryProvider } from '@/agent-detail/composer/composerContext';
import { renderMessage } from '@/lib/renderText';
import { DEMO_READ } from './demo';
import { FileDiffScreen } from './FileDiffScreen';
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

const PATCH = [
  'diff --git a/README.md b/README.md',
  '--- a/README.md',
  '+++ b/README.md',
  '@@ -1,2 +1,2 @@',
  ' keep',
  '-old line',
  '+new line',
  '',
].join('\n');

const AGENT = changesTargetId({ kind: 'agent', hostId: 'demo', paneId: 'p1' });
const DIRECTORY = changesTargetId({ kind: 'directory', hostId: 'demo', directory: '/work/app' });

async function openDiff(agentId: string) {
  const store = new ChangesStore({
    directory: () => '/work/storefront',
    read: async () => DEMO_READ,
    readPatch: async () => ({ files: parsePatchFiles(PATCH, false), isTruncated: false }),
    clock,
  });
  setChangesStoreFactory(() => store);
  await store.refresh();
  store.openDiff(DEMO_READ.changes.files[3] as ChangedFile);
  const storage = new MemoryStorage();
  const registry = new ComposerRegistry({ storage, clock: new FakeClock() });
  const prompt = jest.fn<ReturnType<ComposerPrompt>, Parameters<ComposerPrompt>>(async () => {});
  const composer = registry.composerFor({ key: 'demo/p1', target: 'p1', prompt, status: 'idle' });
  composer.replaceDraft('typed first');
  await render(
    <ThemeProvider themeId="indigo">
      <ComposerRegistryProvider registry={registry}>
        <FileDiffScreen agentId={agentId} storage={storage} />
      </ComposerRegistryProvider>
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('diff-row')).toBeTruthy());
  return { storage, composer, prompt };
}

const keys = (text: Text | null): string[] => {
  if (text === null || typeof text === 'string') return [];
  if ('join' in text) return text.join.flatMap(keys);
  return [text.key, ...(text.args ?? []).flatMap(keys)];
};

afterEach(() => {
  releaseChangesStore(AGENT);
  releaseChangesStore(DIRECTORY);
  setChangesStoreFactory(undefined);
  mockDismissTo.mockClear();
});

describe('Commenting on a diff line', () => {
  it('every key of a comment exists in the app catalog', () => {
    const app = new Set<string>(keysOf('app'));
    for (const removed of [false, true]) {
      for (const text of ['x', '']) {
        const line = { path: 'a.ts', number: 1, removed, text };
        for (const key of keys(lineCommentText(line, 'Fix'))) expect(app.has(key)).toBe(true);
      }
    }
  });

  it('long press, type, add: the draft holds the reference after what was there, nothing is sent, the diff stays', async () => {
    const { storage, composer, prompt } = await openDiff(AGENT);
    expect(screen.queryByTestId('diff-open-chat')).toBeNull();
    await fireEvent(screen.getByTestId('diff-row-add'), 'longPress');
    await fireEvent.changeText(await screen.findByTestId('line-comment-field'), 'Say why');
    await fireEvent.press(screen.getByTestId('line-comment-add'));
    const reference = renderMessage(
      lineCommentText(
        { path: 'README.md', number: 2, removed: false, text: 'new line' },
        'Say why',
      ) as Text,
    );
    await waitFor(() => expect(composer.getSnapshot().draft).toBe(`typed first\n\n${reference}`));
    expect(readDraft(storage, 'demo/p1')).toBe(`typed first\n\n${reference}`);
    expect(composer.getSnapshot().messages).toEqual([]);
    expect(prompt).not.toHaveBeenCalled();
    expect(mockDismissTo).not.toHaveBeenCalled();
    expect(screen.getByTestId('file-diff-screen')).toBeTruthy();
    expect(screen.getByTestId('diff-row')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('diff-open-chat'));
    expect(mockDismissTo).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ paneId: 'p1', surface: 'chat' }),
      }),
    );
  });

  it('a removed line is referenced by its old number, as removed', async () => {
    const { composer } = await openDiff(AGENT);
    await fireEvent(screen.getByTestId('diff-row-del'), 'longPress');
    await fireEvent.changeText(await screen.findByTestId('line-comment-field'), 'Keep it');
    await fireEvent.press(screen.getByTestId('line-comment-add'));
    const reference = renderMessage(
      lineCommentText(
        { path: 'README.md', number: 2, removed: true, text: 'old line' },
        'Keep it',
      ) as Text,
    );
    await waitFor(() => expect(composer.getSnapshot().draft).toBe(`typed first\n\n${reference}`));
  });

  it('a blank comment cannot be added', async () => {
    const { composer } = await openDiff(AGENT);
    await fireEvent(screen.getByTestId('diff-row-add'), 'longPress');
    await fireEvent.changeText(await screen.findByTestId('line-comment-field'), '   ');
    await fireEvent.press(screen.getByTestId('line-comment-add'));
    expect(composer.getSnapshot().draft).toBe('typed first');
  });

  it('a directory target offers nothing on a line', async () => {
    await openDiff(DIRECTORY);
    const line = screen.getByTestId('diff-row-add');
    expect(line.props.accessibilityActions).toBeUndefined();
    await fireEvent(line, 'longPress');
    expect(screen.queryByTestId('line-comment-field')).toBeNull();
    expect(screen.queryByText(t('Comment on Line'))).toBeNull();
  });
});
