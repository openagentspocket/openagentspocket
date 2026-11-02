import { describe, expect, it } from 'vitest';
import { message } from '../errors/text';
import { TransportFailure } from '../errors/transport-error';
import type { FileEntry, FileListing, FileStat } from '../files/ports';
import {
  DirectoryBrowser,
  type DirectoryLister,
  type DirectoryListing,
  listFollowingLinks,
  MAXIMUM_FOLLOWED_LINKS,
} from './directory-browser';

const listing = (
  directories: string[],
  truncated = false,
  links: string[] = [],
): DirectoryListing => ({
  directories,
  truncated,
  symbolicLinks: new Set(links),
});

class FakeLister implements DirectoryLister {
  listings: Record<string, DirectoryListing> = {};
  calls: string[] = [];
  error: unknown;
  gate: Promise<void> | undefined;

  constructor(private readonly home = '/home/you') {}

  async resolveHome() {
    return this.home;
  }

  async list(path: string): Promise<DirectoryListing> {
    this.calls.push(path);
    await this.gate;
    if (this.error !== undefined) throw this.error;
    return this.listings[path] ?? listing([]);
  }
}

const invalid = (path: string) => new TransportFailure({ kind: 'invalidDirectoryPath', path });

describe('DirectoryBrowser', () => {
  it('loads home, then enters and returns', async () => {
    const lister = new FakeLister();
    lister.listings = {
      '/home/you': listing(['src', 'docs']),
      '/home/you/src': listing(['app']),
    };
    const browser = new DirectoryBrowser(lister);
    await browser.start();
    expect(browser.getState().currentPath).toBe('/home/you');
    expect(browser.getState().directories).toEqual(['src', 'docs']);
    await browser.enter('src');
    expect(browser.getState().directories).toEqual(['app']);
    await browser.goBack();
    expect(lister.calls).toEqual(['/home/you', '/home/you/src', '/home/you']);
  });

  it('narrows the current listing with the filter without listing again', async () => {
    const lister = new FakeLister();
    lister.listings = { '/home/you': listing(['alpha', 'beta']) };
    const browser = new DirectoryBrowser(lister);
    await browser.start();
    browser.setFilter('ALP');
    expect(browser.visibleDirectories).toEqual(['alpha']);
    browser.setFilter('');
    expect(browser.visibleDirectories).toEqual(['alpha', 'beta']);
    expect(lister.calls).toEqual(['/home/you']);
  });

  it('walks a Windows home up to the drive root', async () => {
    const lister = new FakeLister('C:\\Users\\dev');
    lister.listings = { 'C:\\Users\\dev': listing(['src']) };
    const browser = new DirectoryBrowser(lister);
    await browser.start();
    await browser.enter('src');
    await browser.goBack();
    await browser.goBack();
    await browser.goBack();
    expect(browser.getState().currentPath).toBe('C:\\');
    expect(browser.canGoBack).toBe(false);
    expect(lister.calls).toEqual([
      'C:\\Users\\dev',
      'C:\\Users\\dev\\src',
      'C:\\Users\\dev',
      'C:\\Users',
      'C:\\',
    ]);
  });

  it('clears the filter on a successful move and keeps it through a failure', async () => {
    const lister = new FakeLister();
    lister.listings = { '/home/you': listing(['src']), '/home/you/src': listing(['app']) };
    const browser = new DirectoryBrowser(lister);
    await browser.start();
    browser.setFilter('src');
    lister.error = invalid('/home/you/src');
    await browser.enter('src');
    expect(browser.getState()).toMatchObject({ currentPath: '/home/you', filter: 'src' });
    expect(browser.getState().error?.kind).toBe('transport');
    expect(browser.getState().isLoading).toBe(false);
    lister.error = undefined;
    await browser.retry();
    expect(browser.getState()).toMatchObject({
      currentPath: '/home/you/src',
      filter: '',
      error: undefined,
    });
    expect(lister.calls).toEqual(['/home/you', '/home/you/src', '/home/you/src']);
  });

  it('tracks the truncation flag per listing', async () => {
    const lister = new FakeLister();
    lister.listings = { '/home/you': listing(['a'], true), '/home/you/a': listing([]) };
    const browser = new DirectoryBrowser(lister);
    await browser.start();
    expect(browser.getState().truncated).toBe(true);
    await browser.enter('a');
    expect(browser.getState().truncated).toBe(false);
  });

  it('shows a home probe failure with no path', async () => {
    const browser = new DirectoryBrowser({
      resolveHome: () =>
        Promise.reject(new TransportFailure({ kind: 'homeDirectoryUnresolvable', detail: 'x' })),
      list: () => Promise.reject(new Error('unreachable')),
    });
    await browser.start();
    expect(browser.getState().currentPath).toBeUndefined();
    expect(browser.getState().error?.kind).toBe('transport');
  });

  it('reports a non-transport failure as a loading message', async () => {
    const lister = new FakeLister();
    lister.error = new Error('disk');
    const browser = new DirectoryBrowser(lister);
    await browser.start();
    expect(browser.getState().error).toMatchObject({ kind: 'message' });
  });

  it('cancel drops an in-flight listing', async () => {
    const lister = new FakeLister();
    let open: () => void = () => undefined;
    lister.gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    lister.listings = { '/home/you': listing(['src']) };
    const browser = new DirectoryBrowser(lister);
    const loading = browser.start();
    await Promise.resolve();
    browser.cancel();
    open();
    await loading;
    expect(browser.getState()).toMatchObject({
      isLoading: false,
      currentPath: undefined,
      error: undefined,
    });
  });

  it('keeps links marked and clears a refusal only on another folder', async () => {
    const lister = new FakeLister();
    lister.listings = {
      '/home/you': listing(['.claude', 'claude-shared'], false, ['claude-shared']),
      '/home/you/.claude': listing(['projects']),
    };
    const browser = new DirectoryBrowser(lister);
    await browser.start();
    expect(browser.isSymbolicLink('claude-shared')).toBe(true);
    expect(browser.isSymbolicLink('.claude')).toBe(false);
    const refusal = message('This directory is already an Account.');
    browser.refuse(refusal);
    await browser.retry();
    expect(browser.getState().refusal).toEqual(refusal);
    await browser.enter('.claude');
    expect(browser.getState().refusal).toBeUndefined();
    expect(browser.getState().symbolicLinks.size).toBe(0);
  });

  it('has no Back at a root or before the first listing', async () => {
    expect(new DirectoryBrowser(new FakeLister()).canGoBack).toBe(false);
    const root = new DirectoryBrowser(new FakeLister('/'));
    await root.start();
    expect(root.canGoBack).toBe(false);
  });
});

describe('listFollowingLinks', () => {
  const entry = (name: string, kind: FileEntry['kind']): FileEntry => ({
    name,
    kind,
    size: null,
    modifiedAt: null,
  });

  function host(
    entries: FileEntry[],
    statuses: Record<string, FileStat['kind']>,
    truncated = false,
  ) {
    const statusCalls: string[] = [];
    return {
      statusCalls,
      list: async (): Promise<FileListing> => ({ entries, truncated, scanIncomplete: false }),
      status: async (path: string): Promise<FileStat | null> => {
        statusCalls.push(path);
        const kind = statuses[path];
        if (kind === undefined) throw new Error('gone');
        return { kind, size: null, modifiedAt: null };
      },
    };
  }

  it('keeps links to directories, drops broken ones and links to files, and sorts', async () => {
    const files = host(
      [
        entry('notes.txt', 'file'),
        entry('claude-shared', 'symlink'),
        entry('.claude', 'directory'),
        entry('broken', 'symlink'),
        entry('notes-link', 'symlink'),
        entry('claude-relative', 'symlink'),
      ],
      {
        '/home/you/claude-shared': 'directory',
        '/home/you/claude-relative': 'directory',
        '/home/you/notes-link': 'file',
      },
    );
    const result = await listFollowingLinks(files, '/home/you');
    expect(result.directories).toEqual(['.claude', 'claude-relative', 'claude-shared']);
    expect([...result.symbolicLinks].sort()).toEqual(['claude-relative', 'claude-shared']);
    expect(result.truncated).toBe(false);
  });

  it('reads as truncated past the followed-link cap', async () => {
    const names = Array.from({ length: MAXIMUM_FOLLOWED_LINKS + 2 }, (_, index) => `l${index}`);
    const statuses = Object.fromEntries(names.map((name) => [`/d/${name}`, 'directory' as const]));
    const files = host(
      names.map((name) => entry(name, 'symlink')),
      statuses,
    );
    const result = await listFollowingLinks(files, '/d');
    expect(files.statusCalls).toHaveLength(MAXIMUM_FOLLOWED_LINKS);
    expect(result.directories).toHaveLength(MAXIMUM_FOLLOWED_LINKS);
    expect(result.truncated).toBe(true);
  });
});
