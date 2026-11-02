import { describe, expect, it } from 'vitest';
import { FileBrowserError, failureText, mutationFailureText } from './errors';
import { bytes, find, home, noticeOf, settle, setupStore, tree } from './fixture.test-util';
import type { FileBrowserItem } from './item';
import type { FileBrowserHost, FileEntry } from './ports';

describe('navigation', () => {
  it('starts at home, folders first, dot-files listed', async () => {
    const { store } = await setupStore({
      files: { ...tree.files, [`${home}/.zshrc`]: bytes('z') },
      directories: tree.directories,
    });
    store.start();
    await settle();
    const state = store.getState();
    expect(state.currentPath).toBe(home);
    expect(state.rootPath).toBe(home);
    expect(state.items.map((i) => i.name)).toEqual(['empty', 'proj', '.zshrc', 'readme.md']);
    expect(store.isDimmed(find(state.items, '.zshrc'))).toBe(true);
    expect(store.isDimmed(find(state.items, 'readme.md'))).toBe(false);
  });

  it('enters folders, goes up, and shows home-relative paths', async () => {
    const { store } = await setupStore(tree);
    store.start();
    await settle();
    expect(store.displayPath).toBe('~');
    store.open(find(store.getState().items, 'proj'));
    await settle();
    expect(store.displayPath).toBe('~/proj');
    expect(store.title).toBe('proj');
    store.goUp();
    await settle();
    expect(store.getState().currentPath).toBe(home);
    expect(store.canGoUp).toBe(true);
  });

  it('opened at a given folder, that folder is the root and home is still learned', async () => {
    const { store } = await setupStore(tree, { startPath: `${home}/proj` });
    store.start();
    await settle();
    expect(store.getState()).toMatchObject({
      rootPath: `${home}/proj`,
      homePath: home,
      currentPath: `${home}/proj`,
    });
  });

  it('a late answer for a folder left behind never lands', async () => {
    const gates = new Map<string, () => void>();
    const { store } = await setupStore(tree, {
      makeHost: (base) =>
        Object.assign(Object.create(base) as FileBrowserHost, {
          list: async (path: string) => {
            if (path === `${home}/proj`)
              await new Promise<void>((resolve) => gates.set(path, resolve));
            return base.list(path);
          },
        }),
    });
    store.start();
    await settle();
    store.open(find(store.getState().items, 'proj'));
    store.open(find(store.getState().items, 'empty'));
    await settle();
    gates.get(`${home}/proj`)?.();
    await settle();
    expect(store.getState().currentPath).toBe(`${home}/empty`);
  });

  it('a failed listing keeps the folder on screen and retry goes where it failed', async () => {
    let broken = true;
    const { store } = await setupStore(tree, {
      makeHost: (base) =>
        Object.assign(Object.create(base) as FileBrowserHost, {
          list: async (path: string) => {
            if (path === `${home}/proj` && broken) throw new FileBrowserError('permissionDenied');
            return base.list(path);
          },
        }),
    });
    store.start();
    await settle();
    store.open(find(store.getState().items, 'proj'));
    await settle();
    expect(store.getState().loadError).toEqual(noticeOf('permissionDenied'));
    expect(store.getState().currentPath).toBe(home);
    broken = false;
    store.retry();
    await settle();
    expect(store.getState()).toMatchObject({ currentPath: `${home}/proj`, loadError: null });
  });

  it('a first listing failure shows its message', async () => {
    const { store } = await setupStore({}, { startPath: '/missing' });
    store.start();
    await settle();
    expect(store.getState().loadError).toEqual(noticeOf('notFound'));
    expect(store.getState().isLoading).toBe(false);
  });

  it('reports truncated and incomplete listings', async () => {
    const { store } = await setupStore(tree, {
      makeHost: (base) =>
        Object.assign(Object.create(base) as FileBrowserHost, {
          list: async (path: string) => ({
            ...(await base.list(path)),
            truncated: true,
            scanIncomplete: true,
          }),
        }),
    });
    store.start();
    await settle();
    expect(store.getState()).toMatchObject({ truncated: true, scanIncomplete: true });
  });

  it('a symlink opens as the folder it points to, as a file, or says it points nowhere', async () => {
    const link = (name: string): FileEntry => ({ name, kind: 'symlink', size: 0, modifiedAt: 0 });
    const targets: Record<string, { kind: 'directory' | 'file' | null; size: number }> = {
      [`${home}/to-dir`]: { kind: 'directory', size: 0 },
      [`${home}/to-file`]: { kind: 'file', size: 5 },
      [`${home}/dangling`]: { kind: null, size: 0 },
    };
    const { store } = await setupStore(
      { ...tree, files: { ...tree.files, [`${home}/to-file`]: bytes('hello') } },
      {
        makeHost: (base) =>
          Object.assign(Object.create(base) as FileBrowserHost, {
            list: async (path: string) => {
              if (path === `${home}/to-dir`)
                return { entries: [], truncated: false, scanIncomplete: false };
              const listing = await base.list(path);
              return path === home
                ? {
                    ...listing,
                    entries: [
                      ...listing.entries,
                      link('to-dir'),
                      link('to-file'),
                      link('dangling'),
                    ],
                  }
                : listing;
            },
            status: async (path: string) => {
              const target = targets[path];
              return target
                ? { kind: target.kind, size: target.size, modifiedAt: 0 }
                : base.status(path);
            },
          }),
      },
    );
    store.start();
    await settle();
    store.open(find(store.getState().items, 'dangling'));
    await settle();
    expect(store.getState().notice).not.toBeNull();
    store.dismissNotice();
    store.open(find(store.getState().items, 'to-dir'));
    await settle();
    expect(store.getState().currentPath).toBe(`${home}/to-dir`);
    store.goUp();
    await settle();
    store.open(find(store.getState().items, 'to-file'));
    await settle();
    expect(store.getState().delivery).toMatchObject({ name: 'to-file', intent: 'preview' });
  });
});

describe('git-ignored names', () => {
  const command = (dir: string) =>
    `GIT_OPTIONAL_LOCKS=0 git -c core.fsmonitor=false -C '${dir}' check-ignore -z --stdin`;

  it('dim once git answers, asked once per folder', async () => {
    let asked = 0;
    const { store } = await setupStore(
      { ...tree, exec: { [command(home)]: { exitCode: 0, stdout: './proj\0', stderr: '' } } },
      {
        makeHost: (base) =>
          Object.assign(Object.create(base) as FileBrowserHost, {
            ignoredNames: (dir: string, names: readonly string[]) => {
              asked++;
              return base.ignoredNames(dir, names);
            },
          }),
      },
    );
    store.start();
    await settle();
    expect(store.isDimmed(find(store.getState().items, 'proj'))).toBe(true);
    store.open(find(store.getState().items, 'proj'));
    await settle();
    store.goUp();
    await settle();
    expect(asked).toBe(2);
    expect(store.isDimmed(find(store.getState().items, 'proj'))).toBe(true);
  });

  it('a Host without git dims nothing', async () => {
    const { store } = await setupStore(tree);
    store.start();
    await settle();
    expect(store.getState().ignoredNames.size).toBe(0);
  });
});

describe('rename and delete', () => {
  it('renames and reloads, validating names first', async () => {
    const { store } = await setupStore(tree);
    store.start();
    await settle();
    const file = find(store.getState().items, 'readme.md');
    store.rename(file, 'a/b');
    expect(store.getState().notice).not.toBeNull();
    store.dismissNotice();
    store.rename(file, 'proj');
    expect(store.getState().notice).toEqual(noticeOf('alreadyExists'));
    store.dismissNotice();
    store.rename(file, 'notes.md');
    await settle();
    expect(store.getState().items.map((i) => i.name)).toContain('notes.md');
    expect(store.getState().items.map((i) => i.name)).not.toContain('readme.md');
  });

  it('never renames or deletes the root, home, system folders or the start folder', async () => {
    const { store } = await setupStore(tree, { startPath: `${home}/proj` });
    store.start();
    await settle();
    const self = (path: string): FileBrowserItem => ({
      name: path.split('/').pop() ?? '',
      path,
      kind: 'directory',
      size: 0,
      modifiedAt: 0,
    });
    for (const path of ['/', '/etc', home, `${home}/proj`]) {
      expect(store.canDelete(self(path))).toBe(false);
      expect(store.canRename(self(path))).toBe(false);
    }
    store.delete(self(home));
    expect(store.getState().notice).toEqual(noticeOf('protectedItem'));
    expect(store.canDelete(self(`${home}/proj/main.ts`))).toBe(true);
  });

  it('deletes, and says a folder is not empty', async () => {
    const { store, session } = await setupStore(tree);
    store.start();
    await settle();
    store.delete(find(store.getState().items, 'proj'));
    await settle();
    expect(store.getState().notice).toEqual(noticeOf('directoryNotEmpty'));
    store.delete(find(store.getState().items, 'readme.md'));
    await settle();
    expect(session.files.has(`${home}/readme.md`)).toBe(false);
    expect(store.getState().items.map((i) => i.name)).not.toContain('readme.md');
  });

  it('a change cut by a dropped link says it may have happened', async () => {
    const dropped = Object.assign(new Error('link died'), { code: 'connectionInvalidated' });
    const { store } = await setupStore(tree, {
      makeHost: (base) =>
        Object.assign(Object.create(base) as FileBrowserHost, {
          delete: async () => {
            throw dropped;
          },
        }),
    });
    store.start();
    await settle();
    store.delete(find(store.getState().items, 'readme.md'));
    await settle();
    expect(store.getState().notice).toEqual(mutationFailureText(dropped));
    expect(mutationFailureText(dropped)).not.toEqual(failureText(dropped));
    expect(store.getState().isMutating).toBe(false);
  });
});

describe('close', () => {
  it('cancels work, stops late answers and removes every copy', async () => {
    const { store, local } = await setupStore(tree);
    store.start();
    await settle();
    store.requestFile(find(store.getState().items, 'readme.md'), 'share');
    await settle();
    expect(store.getState().delivery).not.toBeNull();
    store.open(find(store.getState().items, 'proj'));
    store.close();
    await settle();
    expect(store.getState()).toMatchObject({ delivery: null, isLoading: false, transfer: null });
    expect(store.getState().currentPath).toBe(home);
    expect(local.files.size).toBe(0);
    store.open(find(store.getState().items, 'proj'));
    await settle();
    expect(store.getState().currentPath).toBe(home);
  });
});
