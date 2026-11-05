import {
  AttachmentError,
  ComposerStagingStore,
  MemoryStorage,
  makeSkill,
  makeSnippet,
  SkillsPaneStore,
  SnippetStore,
} from '@openagentspocket/core';
import { setLocale } from '@openagentspocket/i18n';
import { OverlayHost, ThemeProvider } from '@openagentspocket/ui';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { attachmentSource, remoteFileName, remoteImageName } from './attachmentSources';
import { SkillsPane } from './SkillsPane';
import { SnippetsManager } from './SnippetsManager';
import { SnippetsPane } from './SnippetsPane';
import { StagingStatusBar } from './StagingStatusBar';

const wrap = (node: React.ReactElement) =>
  render(
    <ThemeProvider themeId="indigo">
      {node}
      <OverlayHost />
    </ThemeProvider>,
  );

afterEach(async () => {
  await cleanup();
  setLocale('en');
});

function seeded(...bodies: string[]) {
  const store = new SnippetStore(new MemoryStorage());
  for (const body of bodies) store.add(makeSnippet({ title: '', body }));
  return store;
}

describe('SnippetsPane', () => {
  it('inserts the tapped Snippet text without a submit byte', async () => {
    const store = seeded('make test', 'git status');
    const insert = jest.fn();
    await wrap(<SnippetsPane store={store} onInsert={insert} onManage={jest.fn()} />);
    const first = store.snippets[0];
    await fireEvent.press(screen.getByTestId(`snippet-${first?.id}`));
    expect(insert).toHaveBeenCalledWith('make test');
    expect(insert.mock.calls[0]?.[0]).not.toMatch(/[\r]/);
  });

  it('filters by the search text', async () => {
    const store = seeded('make test', 'git status');
    await wrap(<SnippetsPane store={store} onInsert={jest.fn()} onManage={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('snippets-search'), 'GIT');
    expect(screen.queryByTestId(`snippet-${store.snippets[0]?.id}`)).toBeNull();
    expect(screen.getByTestId(`snippet-${store.snippets[1]?.id}`)).toBeTruthy();
  });

  it('offers management when empty and explains an unreadable catalog', async () => {
    const manage = jest.fn();
    await wrap(<SnippetsPane store={seeded()} onInsert={jest.fn()} onManage={manage} />);
    await fireEvent.press(screen.getByTestId('snippets-manage'));
    expect(manage).toHaveBeenCalled();
    await cleanup();
    const broken = new MemoryStorage();
    broken.set('snippets', 'garbage');
    await wrap(
      <SnippetsPane store={new SnippetStore(broken)} onInsert={jest.fn()} onManage={manage} />,
    );
    expect(screen.getByTestId('snippets-unavailable')).toBeTruthy();
  });
});

describe('SnippetsManager', () => {
  it('adds a Snippet through the editor and refuses a blank one', async () => {
    const store = seeded();
    await wrap(<SnippetsManager store={store} />);
    await fireEvent.press(screen.getByTestId('snippet-new'));
    await fireEvent.press(await screen.findByTestId('snippet-save'));
    expect(store.snippets).toHaveLength(0);
    await fireEvent.changeText(screen.getByTestId('snippet-body'), 'run the tests');
    await fireEvent.press(screen.getByTestId('snippet-save'));
    await waitFor(() => expect(store.snippets.map((s) => s.body)).toEqual(['run the tests']));
  });
});

describe('SkillsPane', () => {
  const skills = [
    makeSkill({ scope: 'project', name: 'deploy', description: 'Ship it.' }),
    makeSkill({ scope: 'global', name: 'pdf', commandPrefix: '$' }),
  ];

  it('loads lazily and inserts the command with a trailing space', async () => {
    const store = new SkillsPaneStore({ fetch: async () => skills });
    const insert = jest.fn();
    await wrap(<SkillsPane store={store} onInsert={insert} />);
    await fireEvent.press(await screen.findByTestId('skill-project|/deploy'));
    expect(insert).toHaveBeenCalledWith('/deploy ');
    await fireEvent.press(screen.getByTestId('skill-global|$pdf'));
    expect(insert).toHaveBeenLastCalledWith('$pdf ');
  });

  it('shows a failure with a retry that reloads', async () => {
    let fail = true;
    const store = new SkillsPaneStore({
      fetch: async () => {
        if (fail) throw new Error('boom');
        return skills;
      },
    });
    await wrap(<SkillsPane store={store} onInsert={jest.fn()} />);
    expect(await screen.findByTestId('skills-failed')).toBeTruthy();
    fail = false;
    await act(async () => {
      await store.refresh();
    });
    expect(await screen.findByTestId('skills-pane')).toBeTruthy();
  });
});

describe('attachment sources and the status bar', () => {
  const files = (size: number | null) => ({
    size: async () => size,
    readAll: async () => new Uint8Array(size ?? 0),
    remove: jest.fn(async () => {}),
  });
  const picked = { uri: 'file:///cache/p.jpg', name: 'p.jpg', extension: 'jpg' };
  const signal = { aborted: false, addEventListener: () => {}, removeEventListener: () => {} };

  it('names files safely and images neutrally', () => {
    expect(remoteFileName('../../etc/pass\u0007wd')).toBe('pass_wd');
    expect(remoteFileName('...')).toBe('file');
    expect(remoteImageName('HEIC')).toBe('image.heic');
    expect(remoteImageName('')).toBe('image.jpg');
  });

  it('refuses a vanished or oversized pick before staging', async () => {
    const missing = attachmentSource('file', picked, files(null));
    await expect(missing.prepare(signal)).rejects.toMatchObject({ kind: 'selectionUnavailable' });
    const huge = attachmentSource('file', picked, files(65 * 1024 * 1024));
    await expect(huge.prepare(signal)).rejects.toBeInstanceOf(AttachmentError);
    const ready = await attachmentSource('image', picked, files(10)).prepare(signal);
    expect(ready.byteCount).toBe(10);
  });

  it('shows progress then the inserted path, and Dismiss clears it', async () => {
    const draft: string[] = [];
    const store = new ComposerStagingStore({
      stage: { image: async () => '/tmp/a/image.jpg', file: async () => '/tmp/a/f' },
      clipboard: { copy: () => {} },
      composer: { insertIntoDraft: (text) => draft.push(text) },
    });
    await wrap(<StagingStatusBar store={store} />);
    expect(screen.queryByTestId('staging-status-bar')).toBeNull();
    await act(async () => {
      store.begin(attachmentSource('image', picked, files(10)));
      await store.settled();
    });
    expect(draft).toEqual(['/tmp/a/image.jpg ']);
    expect(screen.getByTestId('staging-status-bar')).toBeTruthy();
    await act(async () => {
      await store.perform('dismiss');
    });
    expect(screen.queryByTestId('staging-status-bar')).toBeNull();
  });
});
