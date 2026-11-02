import { message, type Text } from '../errors/text';
import { CancelledError } from '../hosts/cancellation';
import type { FileBrowserDownloads } from './downloads';
import { FileBrowserError, failureText, mutationFailureText } from './errors';
import { type FileBrowserItem, isNameUsable, sortItems, toItem } from './item';
import { nameProblem, RemotePath } from './path';
import type { FileBrowserHost, LocalFiles } from './ports';
import type { FilePreparer } from './preparer';
import type {
  CollisionChoice,
  FileBrowserState,
  FileBrowserUpload,
  FileIntent,
} from './store-types';
import { FileTransfers } from './transfers';

export interface FileBrowserStoreOptions {
  hostName: string;
  /** Where to open; the Host's home when omitted. */
  startPath?: string;
  host: FileBrowserHost;
  local: LocalFiles;
  downloads: FileBrowserDownloads;
  preparer: FilePreparer;
}

const isCancel = (error: unknown) => error instanceof CancelledError;

/**
 * The file browser's model: one Host's tree over SFTP, one folder at a time. A tapped file
 * downloads into the browser's own temporary folder for the viewer, share sheet or Files; uploads,
 * renames and deletes run one at a time and reload the folder after. State is an immutable
 * snapshot (`getState`) with `subscribe`, so a hook can read it with useSyncExternalStore.
 *
 * The owner calls `close()` on dismiss: it cancels whatever is in flight so a late answer never
 * lands, and removes the downloaded copies.
 */
export class FileBrowserStore {
  private state: FileBrowserState;
  private readonly listeners = new Set<() => void>();
  private readonly host: FileBrowserHost;
  private readonly local: LocalFiles;
  private readonly downloads: FileBrowserDownloads;
  private readonly preparer: FilePreparer;
  private readonly startPath: string | undefined;
  private readonly transfers: FileTransfers;
  private loadSeq = 0;
  private ignoredSeq = 0;
  private symlinkSeq = 0;
  private requestedPath: string | null | undefined;
  /** Each folder's answer from git: the names asked about and those it ignores. */
  private readonly ignoredCache = new Map<
    string,
    { asked: Set<string>; ignored: ReadonlySet<string> }
  >();
  private closed = false;

  constructor(options: FileBrowserStoreOptions) {
    ({
      host: this.host,
      local: this.local,
      downloads: this.downloads,
      preparer: this.preparer,
    } = options);
    this.startPath = options.startPath;
    this.transfers = new FileTransfers({
      host: this.host,
      local: this.local,
      downloads: this.downloads,
      preparer: this.preparer,
      get: () => this.state,
      set: (patch) => this.set(patch),
      isClosed: () => this.closed,
      reload: (directory) => this.reloadAfterChange(directory),
    });
    this.state = {
      hostName: options.hostName,
      rootPath: options.startPath ?? null,
      homePath: null,
      currentPath: null,
      items: [],
      ignoredNames: new Set(),
      truncated: false,
      scanIncomplete: false,
      isLoading: false,
      loadError: null,
      transfer: null,
      isMutating: false,
      notice: null,
      pendingDownload: null,
      pendingCollision: null,
      delivery: null,
    };
  }

  getState = (): FileBrowserState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<FileBrowserState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of [...this.listeners]) listener();
  }

  // Navigation

  /** Lists the start folder, or resolves the Host's home and lists it. */
  start() {
    if (this.startPath !== undefined) {
      this.host.homeDirectory().then(
        (homePath) => this.closed || this.set({ homePath }),
        () => {},
      );
    }
    this.load(this.startPath ?? null);
  }

  /** Retries the folder that failed instead of starting over. */
  retry() {
    this.load(this.requestedPath ?? this.state.currentPath ?? this.startPath ?? null);
  }

  refresh() {
    if (this.state.currentPath) this.load(this.state.currentPath);
    else this.start();
  }

  get canGoUp(): boolean {
    return this.state.currentPath !== null && RemotePath.parent(this.state.currentPath) !== null;
  }

  goUp() {
    const parent =
      this.state.currentPath === null ? null : RemotePath.parent(this.state.currentPath);
    if (parent !== null) this.load(parent);
  }

  /** A folder opens; a symlink opens as what it points to; a file downloads for the viewer. */
  open(item: FileBrowserItem) {
    if (!isNameUsable(item)) return this.set({ notice: new FileBrowserError('unusableName').text });
    if (item.kind === 'directory') this.load(item.path);
    else if (item.kind === 'symlink') this.openSymlink(item);
    else this.requestFile(item, 'preview');
  }

  /** `~/projects/app` under the home folder, the full path elsewhere. */
  get displayPath(): string | null {
    const { currentPath, homePath } = this.state;
    if (currentPath === null) return null;
    if (homePath === null || homePath === '/') return currentPath;
    if (currentPath === homePath) return '~';
    return currentPath.startsWith(`${homePath}/`)
      ? `~${currentPath.slice(homePath.length)}`
      : currentPath;
  }

  get title(): string {
    return this.state.currentPath === null
      ? this.state.hostName
      : RemotePath.lastComponent(this.state.currentPath);
  }

  /** Dot-files, what git ignores in this folder, and names the browser cannot use. */
  isDimmed(item: FileBrowserItem): boolean {
    return (
      item.name.startsWith('.') || this.state.ignoredNames.has(item.name) || !isNameUsable(item)
    );
  }

  /** Cancels everything in flight and removes the downloaded copies. */
  close() {
    this.closed = true;
    this.loadSeq++;
    this.ignoredSeq++;
    this.symlinkSeq++;
    this.transfers.cancelAll();
    const { pendingCollision } = this.state;
    if (pendingCollision) this.transfers.discard(pendingCollision.upload);
    this.set({
      isLoading: false,
      transfer: null,
      pendingCollision: null,
      pendingDownload: null,
      delivery: null,
    });
    void this.downloads.removeAll();
  }

  dismissNotice() {
    this.set({ notice: null });
  }

  private load(path: string | null) {
    if (this.closed) return;
    const seq = ++this.loadSeq;
    this.requestedPath = path;
    this.set({ loadError: null, isLoading: true });
    const run = async () => {
      let target = path;
      if (target === null) {
        const homePath = await this.host.homeDirectory();
        if (seq !== this.loadSeq) return;
        this.set({ homePath, rootPath: this.state.rootPath ?? homePath });
        target = homePath;
      }
      const listing = await this.host.list(target);
      if (seq !== this.loadSeq) return;
      this.requestedPath = undefined;
      this.set({
        currentPath: target,
        items: sortItems(listing.entries.map((entry) => toItem(entry, target))),
        truncated: listing.truncated,
        scanIncomplete: listing.scanIncomplete,
        loadError: null,
        isLoading: false,
      });
      this.loadIgnoredNames(target);
    };
    run().catch((error) => {
      if (seq !== this.loadSeq) return;
      this.set({ isLoading: false, loadError: isCancel(error) ? null : failureText(error) });
    });
  }

  /** Never blocks the listing: rows dim when git answers. Git is asked only about the names on screen. */
  private loadIgnoredNames(path: string) {
    const seq = ++this.ignoredSeq;
    const candidates = this.state.items.filter(isNameUsable).map((item) => item.name);
    const cached = this.ignoredCache.get(path);
    if (cached && candidates.every((name) => cached.asked.has(name))) {
      this.set({ ignoredNames: cached.ignored });
      return;
    }
    this.set({ ignoredNames: new Set() });
    if (candidates.length === 0) return;
    this.host
      .ignoredNames(path, [...candidates].sort())
      .catch(() => new Set<string>() as ReadonlySet<string>)
      .then((ignored) => {
        if (seq !== this.ignoredSeq || this.closed) return;
        this.ignoredCache.set(path, { asked: new Set(candidates), ignored });
        if (this.state.currentPath === path) this.set({ ignoredNames: ignored });
      });
  }

  private openSymlink(item: FileBrowserItem) {
    const seq = ++this.symlinkSeq;
    this.host.status(item.path).then(
      (status) => {
        if (this.closed || seq !== this.symlinkSeq) return;
        if (status === null || status.kind === null) {
          this.set({ notice: message('The link points to nothing.') });
        } else if (status.kind === 'directory') {
          this.load(item.path);
        } else {
          this.requestFile({ ...item, kind: status.kind, size: status.size }, 'preview');
        }
      },
      (error) => {
        if (!this.closed && seq === this.symlinkSeq && !isCancel(error))
          this.set({ notice: failureText(error) });
      },
    );
  }

  // Downloads and uploads (see FileTransfers)

  /** Starts a download, asking first for secrets, large files and big shares; refuses huge ones. */
  requestFile(item: FileBrowserItem, intent: FileIntent) {
    this.transfers.requestFile(item, intent);
  }

  /** Goes ahead with the pending download; either size dialog answers for the size. */
  confirmPendingDownload(as?: FileIntent) {
    this.transfers.confirmPendingDownload(as);
  }

  cancelPendingDownload() {
    this.set({ pendingDownload: null });
  }

  cancelTransfer() {
    this.transfers.cancelTransfer();
  }

  /** The delivery was shown, shared or exported: its copy goes. */
  finishDelivery() {
    this.transfers.finishDelivery();
  }

  /** Copies a picked document into app storage, then uploads it under `name`. */
  importFile(sourceUri: string, name: string, extension: string) {
    this.transfers.importFile(sourceUri, name, extension);
  }

  /** Uploads a photo already re-encoded by the picker as "Photo <date> <time>.<ext>". */
  importPhoto(sourceUri: string, extension: string, now: Date = new Date()) {
    this.transfers.importPhoto(sourceUri, extension, now);
  }

  /** Uploads a prepared file to the current folder; a taken name asks Replace / Keep Both / Cancel. */
  upload(upload: FileBrowserUpload) {
    this.transfers.upload(upload);
  }

  resolveCollision(choice: CollisionChoice) {
    this.transfers.resolveCollision(choice);
  }

  // Rename and delete

  rename(item: FileBrowserItem, newName: string) {
    if (newName === item.name) return;
    if (!this.canRename(item)) return this.set({ notice: this.refusal(item) });
    const problem = nameProblem(newName);
    if (problem) return this.set({ notice: problem });
    if (this.state.items.some((other) => other.name === newName)) {
      return this.set({ notice: new FileBrowserError('alreadyExists').text });
    }
    this.mutate(() => this.host.rename(item.path, newName));
  }

  /** `/` and the folders in it, the home folder and the opened folder stay; so do unusable names. */
  canDelete(item: FileBrowserItem): boolean {
    const { homePath, rootPath } = this.state;
    const protectedPath =
      RemotePath.isSystemPath(item.path) || item.path === homePath || item.path === rootPath;
    return isNameUsable(item) && !protectedPath;
  }

  /** The same items as `canDelete`: moving one is as disruptive. */
  canRename(item: FileBrowserItem): boolean {
    return this.canDelete(item);
  }

  private refusal(item: FileBrowserItem): Text {
    return new FileBrowserError(isNameUsable(item) ? 'protectedItem' : 'unusableName').text;
  }

  delete(item: FileBrowserItem) {
    if (!this.canDelete(item)) return this.set({ notice: this.refusal(item) });
    this.mutate(() => this.host.delete(item.path, item.kind ?? 'file'));
  }

  private mutate(operation: () => Promise<void>) {
    const directory = this.state.currentPath;
    if (this.state.isMutating || directory === null) return;
    this.set({ isMutating: true });
    operation()
      .catch((error) => {
        if (!isCancel(error)) this.set({ notice: mutationFailureText(error) });
      })
      .then(() => {
        if (this.closed) return;
        this.set({ isMutating: false });
        this.reloadAfterChange(directory);
      });
  }

  /** A change can add a name git ignores, so its folder asks git again. */
  private reloadAfterChange(directory: string) {
    this.ignoredCache.delete(directory);
    if (this.state.currentPath === directory) this.load(directory);
  }
}
