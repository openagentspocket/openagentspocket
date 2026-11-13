import {
  CHANGES_KEYS,
  type ChangedFile,
  ChangesReadError,
  ChangesStore,
  type Clock,
  type FilePatch,
  MemoryStorage,
  parsePatchFiles,
} from '@openagentspocket/core';
import { message, setLocale } from '@openagentspocket/i18n';
import { ThemeProvider } from '@openagentspocket/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ChangesScreen } from './ChangesScreen';
import { DEMO_READ } from './demo';
import { diffHunks, isEmptyPatch, wordSegments } from './diffLines';
import { FileDiffScreen } from './FileDiffScreen';
import { releaseChangesStore, setChangesStoreFactory } from './registry';
import { buildSections } from './rows';
import { say } from './say';

const clock: Clock = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  monotonicMs: () => Date.now(),
};

const PATCH = [
  'diff --git a/a.txt b/a.txt',
  '--- a/a.txt',
  '+++ b/a.txt',
  '@@ -1,2 +1,2 @@',
  ' keep',
  '-old',
  '+new',
  '',
].join('\n');

const patchOf = (isTruncated = false): FilePatch => ({
  files: parsePatchFiles(PATCH, isTruncated),
  isTruncated,
});

interface Setup {
  read?: () => Promise<typeof DEMO_READ>;
  patch?: (limit: string) => Promise<FilePatch>;
}

function install(setup: Setup = {}) {
  const limits: string[] = [];
  const store = new ChangesStore({
    directory: () => '/work/storefront',
    read: setup.read ?? (async () => DEMO_READ),
    readPatch: async (request) => {
      limits.push(request.limit);
      return setup.patch ? setup.patch(request.limit) : patchOf();
    },
    listUntrackedDirectory: async (request) => ({
      directory: request.directory,
      entries: [
        {
          path: `${request.directory}a.txt`,
          originalPath: null,
          kind: 'untracked',
          staging: null,
          lineCounts: null,
        },
      ],
      total: 1,
      isTruncated: false,
      isSeparateRepository: false,
      limitNotice: null,
    }),
    clock,
  });
  setChangesStoreFactory(() => store);
  return { store, limits };
}

const wrap = async (node: React.ReactElement) =>
  render(<ThemeProvider themeId="indigo">{node}</ThemeProvider>);

afterEach(() => {
  jest.restoreAllMocks();
  releaseChangesStore('a1');
  setLocale('en');
});

describe('Changes catalog keys', () => {
  it('every key the feature speaks exists in both catalogs', () => {
    for (const locale of ['en', 'es'] as const) {
      const missing = CHANGES_KEYS.filter((key) => message(locale, 'app', key) === undefined);
      expect(missing).toEqual([]);
    }
  });
});

describe('ChangesScreen', () => {
  it('shows the Checkout header and the files in Source Control groups', async () => {
    install();
    await wrap(<ChangesScreen agentId="a1" storage={new MemoryStorage()} onOpenFile={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('changes-header')).toBeTruthy());
    expect(screen.getAllByTestId('change-section')).toHaveLength(4);
    expect(screen.getByTestId('changes-file-src/cart/Cart.ts')).toBeTruthy();
  });

  it('opens a file in the diff and tells the route', async () => {
    const opened: string[] = [];
    const { store } = install();
    await wrap(
      <ChangesScreen
        agentId="a1"
        storage={new MemoryStorage()}
        onOpenFile={(file: ChangedFile) => opened.push(file.path)}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('changes-file-README.md')).toBeTruthy());
    fireEvent.press(screen.getByTestId('changes-file-README.md'));
    expect(opened).toEqual(['README.md']);
    expect(store.fileDiff.current?.getState().file.path).toBe('README.md');
  });

  it('expands an untracked directory in place', async () => {
    install();
    await wrap(<ChangesScreen agentId="a1" storage={new MemoryStorage()} onOpenFile={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('changes-file-scratch/')).toBeTruthy());
    fireEvent.press(screen.getByTestId('changes-file-scratch/'));
    await waitFor(() => expect(screen.getByTestId('changes-file-scratch/a.txt')).toBeTruthy());
  });

  it('a clean Checkout says so', async () => {
    install({
      read: async () => ({
        directoryPrefix: '',
        changes: {
          ...DEMO_READ.changes,
          files: [],
          totals: { ...DEMO_READ.changes.totals, trackedFiles: 0, untrackedItems: 0 },
        },
      }),
    });
    await wrap(<ChangesScreen agentId="a1" storage={new MemoryStorage()} onOpenFile={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('changes-clean')).toBeTruthy());
  });

  it('a git failure shows its state with Try Again, which reads again', async () => {
    let attempts = 0;
    install({
      read: async () => {
        attempts += 1;
        if (attempts === 1) throw new ChangesReadError({ kind: 'notAGitWorkingTree' });
        return DEMO_READ;
      },
    });
    await wrap(<ChangesScreen agentId="a1" storage={new MemoryStorage()} onOpenFile={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('changes-failure')).toBeTruthy());
    fireEvent.press(screen.getByText(say('Try Again')));
    await waitFor(() => expect(screen.getByTestId('changes-header')).toBeTruthy());
    expect(attempts).toBe(2);
  });
});

describe('FileDiffScreen', () => {
  async function open(setup: Setup = {}) {
    const harness = install(setup);
    await harness.store.refresh();
    const file = DEMO_READ.changes.files[3] as ChangedFile;
    harness.store.openDiff(file);
    return harness;
  }

  it('renders the patch as numbered lines', async () => {
    await open();
    await wrap(<FileDiffScreen agentId="a1" storage={new MemoryStorage()} />);
    await waitFor(() => expect(screen.getByTestId('diff-row')).toBeTruthy());
    expect(screen.getAllByTestId('diff-row-add')).toHaveLength(1);
    expect(screen.getAllByTestId('diff-row-del')).toHaveLength(1);
  });

  it('a failed read offers Try Again', async () => {
    let attempts = 0;
    await open({
      patch: async () => {
        attempts += 1;
        if (attempts === 1) throw new ChangesReadError({ kind: 'incomplete' });
        return patchOf();
      },
    });
    await wrap(<FileDiffScreen agentId="a1" storage={new MemoryStorage()} />);
    await waitFor(() => expect(screen.getByTestId('diff-failure')).toBeTruthy());
    fireEvent.press(screen.getByText(say('Try Again')));
    await waitFor(() => expect(screen.getByTestId('diff-row')).toBeTruthy());
  });

  it('a truncated patch loads more at the extended cap', async () => {
    const { limits } = await open({ patch: async (limit) => patchOf(limit === 'initial') });
    await wrap(<FileDiffScreen agentId="a1" storage={new MemoryStorage()} />);
    await waitFor(() => expect(screen.getByTestId('diff-row')).toBeTruthy());
    const more = screen.getAllByRole('button').at(-1);
    await act(async () => {
      if (more) fireEvent.press(more);
    });
    await waitFor(() => expect(limits).toEqual(['initial', 'extended']));
  });

  it.each([
    [400, false],
    [900, true],
  ])(
    'at width %d the layout toggle shows: %s, and switches to side by side',
    async (width, shown) => {
      await open();
      await wrap(<FileDiffScreen agentId="a1" storage={new MemoryStorage()} width={width} />);
      await waitFor(() => expect(screen.getByTestId('diff-row')).toBeTruthy());
      expect(screen.queryByTestId('layout-split') !== null).toBe(shown);
      if (shown) {
        await fireEvent.press(screen.getByTestId('layout-split'));
        expect(screen.getAllByTestId('diff-row-split').length).toBeGreaterThan(0);
      }
    },
  );
});

describe('rows and diff lines', () => {
  it('buildSections puts an expanded directory listing under its row', () => {
    const dir = DEMO_READ.changes.files.find((f) => f.path === 'scratch/') as ChangedFile;
    const sections = buildSections(
      DEMO_READ.changes,
      new Map([[dir.path, { kind: 'loading' as const }]]),
    );
    expect(sections.map((s) => s.key)).toEqual(['conflicts', 'staged', 'changes', 'untracked']);
    const untracked = sections.find((s) => s.key === 'untracked')?.data ?? [];
    expect(untracked.map((r) => r.kind)).toEqual(['file', 'file', 'note']);
  });

  it('diffHunks numbers the lines, washes changed words and counts skipped lines between hunks', () => {
    const files = parsePatchFiles(
      'diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n-var subtitle: String\n+var spokenTitle: String\n@@ -20 +20 @@\n-c\n+d\n',
      false,
    );
    const hunks = diffHunks(files[0] as (typeof files)[number]);
    expect(hunks.map((h) => h.header)).toEqual(['@@ -1,1 +1,1 @@', '@@ -20,1 +20,1 @@']);
    expect(hunks[0]?.gapLabel).toBeUndefined();
    expect(hunks[1]?.gapLabel).toBe('18 unchanged lines');
    expect(hunks[0]?.lines[0]).toMatchObject({ kind: 'del', oldNumber: 1 });
    expect(hunks[0]?.lines[1]?.segments?.find((s) => s.changed)?.text).toBe('spokenTitle');
    expect(hunks[1]?.lines[0]?.segments).toBeUndefined();
    expect(wordSegments('same', 'same')).toBeNull();
    expect(isEmptyPatch(files)).toBe(false);
    expect(isEmptyPatch([])).toBe(true);
  });
});
