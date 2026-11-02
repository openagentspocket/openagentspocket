import { Observable } from '../changes/observable';
import {
  presentation,
  type TransportErrorPresentation,
  userFacingDescription,
} from '../errors/presentation';
import { type Message, message } from '../errors/text';
import { TransportFailure } from '../errors/transport-error';
import type { FileBrowserHost } from '../files/ports';
import { RemoteHostPath } from './remote-path';

/** One directory's subdirectories, sorted by name. */
export interface DirectoryListing {
  readonly directories: readonly string[];
  /** The names in `directories` that are symbolic links to a directory. */
  readonly symbolicLinks: ReadonlySet<string>;
  /** More entries exist than the listing shows. */
  readonly truncated: boolean;
}

/** What the browser needs from a Host: its home, and one folder's subdirectories. */
export interface DirectoryLister {
  resolveHome(): Promise<string>;
  list(path: string): Promise<DirectoryListing>;
}

/** Links one listing follows; past them it reads as truncated. */
export const MAXIMUM_FOLLOWED_LINKS = 100;

/**
 * A listing of the subdirectories of `path`, with symbolic links that resolve to a directory
 * counted as directories (a program reads some folders by the path it is given, so a link is as
 * good a choice). A link that is broken or cannot be followed is left out.
 */
export async function listFollowingLinks(
  host: Pick<FileBrowserHost, 'list' | 'status'>,
  path: string,
): Promise<DirectoryListing> {
  const listing = await host.list(path);
  const directories: string[] = [];
  const links = new Set<string>();
  let truncated = listing.truncated || listing.scanIncomplete;
  let followed = 0;
  for (const entry of listing.entries) {
    if (entry.kind === 'directory') {
      directories.push(entry.name);
    } else if (entry.kind === 'symlink') {
      if (followed >= MAXIMUM_FOLLOWED_LINKS) {
        truncated = true;
        continue;
      }
      followed += 1;
      const target = await host
        .status(RemoteHostPath.childPath(path, entry.name))
        .catch(() => null);
      if (target?.kind !== 'directory') continue;
      directories.push(entry.name);
      links.add(entry.name);
    }
  }
  directories.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { directories, symbolicLinks: links, truncated };
}

/** The browser over a file-browser host. */
export function directoryListerFor(host: FileBrowserHost): DirectoryLister {
  return {
    resolveHome: () => host.homeDirectory(),
    list: (path) => listFollowingLinks(host, path),
  };
}

export type BrowserError =
  | { readonly kind: 'transport'; readonly presentation: TransportErrorPresentation }
  | { readonly kind: 'message'; readonly message: Message };

export interface DirectoryBrowserState {
  /** The last successfully listed path; undefined until the home probe answers. */
  readonly currentPath: string | undefined;
  readonly directories: readonly string[];
  readonly symbolicLinks: ReadonlySet<string>;
  readonly truncated: boolean;
  readonly isLoading: boolean;
  /** The last home or listing failure; the prior path and listing stay on screen. */
  readonly error: BrowserError | undefined;
  /** Why the owner turned down the offered folder, shown until the browser moves on. */
  readonly refusal: Message | undefined;
  /** Narrows the current listing only; it never walks the tree. */
  readonly filter: string;
}

function browserError(error: unknown): BrowserError {
  if (error instanceof TransportFailure) {
    return { kind: 'transport', presentation: presentation(error.error) };
  }
  return {
    kind: 'message',
    message: message('Loading directories failed: %@', userFacingDescription(error)),
  };
}

/**
 * The remote-directory browser's model: starting at the Host's home, it lists one absolute path's
 * subdirectories at a time. Selecting a folder updates the Workspace draft; a failed listing keeps
 * the prior path and filter on screen.
 */
export class DirectoryBrowser extends Observable<DirectoryBrowserState> {
  /** Bumped by every load and by `cancel`, so a late answer to an older load is dropped. */
  private generation = 0;
  private requestedPath: string | undefined;

  constructor(private readonly lister: DirectoryLister) {
    super({
      currentPath: undefined,
      directories: [],
      symbolicLinks: new Set(),
      truncated: false,
      isLoading: false,
      error: undefined,
      refusal: undefined,
      filter: '',
    });
  }

  /** The current listing narrowed by the filter, in server order. */
  get visibleDirectories(): readonly string[] {
    const { directories, filter } = this.getState();
    if (filter === '') return directories;
    const needle = filter.toLowerCase();
    return directories.filter((name) => name.toLowerCase().includes(needle));
  }

  isSymbolicLink(name: string): boolean {
    return this.getState().symbolicLinks.has(name);
  }

  /** Whether Back has a parent to return to; a filesystem root has none. */
  get canGoBack(): boolean {
    const { currentPath } = this.getState();
    return currentPath !== undefined && RemoteHostPath.parentPath(currentPath) !== undefined;
  }

  setFilter(filter: string): void {
    this.set({ filter });
  }

  /** The owner turned the offered folder down; the browser shows why until it moves on. */
  refuse(reason: Message | undefined): void {
    this.set({ refusal: reason });
  }

  /** Resolves the Host's home and loads it. */
  start(): Promise<void> {
    return this.load(undefined);
  }

  /** Retries the failed destination instead of sending the user home. */
  retry(): Promise<void> {
    return this.load(this.requestedPath);
  }

  enter(name: string): Promise<void> {
    const { currentPath } = this.getState();
    return currentPath === undefined
      ? Promise.resolve()
      : this.load(RemoteHostPath.childPath(currentPath, name));
  }

  goBack(): Promise<void> {
    const { currentPath } = this.getState();
    const parent = currentPath === undefined ? undefined : RemoteHostPath.parentPath(currentPath);
    return parent === undefined ? Promise.resolve() : this.load(parent);
  }

  /** Drops the in-flight home probe or listing, so a late answer never lands on a stale path. */
  cancel(): void {
    this.generation += 1;
    this.set({ isLoading: false });
  }

  private async load(path: string | undefined): Promise<void> {
    this.generation += 1;
    const mine = this.generation;
    this.requestedPath = path;
    this.set({ error: undefined, isLoading: true });
    try {
      const target = path ?? (await this.lister.resolveHome());
      if (mine !== this.generation) return;
      const listing = await this.lister.list(target);
      if (mine !== this.generation) return;
      const moved = this.getState().currentPath !== target;
      this.set({
        currentPath: target,
        directories: listing.directories,
        symbolicLinks: listing.symbolicLinks,
        truncated: listing.truncated,
        error: undefined,
        isLoading: false,
        ...(moved ? { filter: '', refusal: undefined } : {}),
      });
    } catch (error) {
      if (mine !== this.generation) return;
      this.set({ error: browserError(error), isLoading: false });
    }
  }
}
