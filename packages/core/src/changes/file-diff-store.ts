import type { Translate } from '../errors/text';
import { type CancelSignal, createCancellation } from '../hosts/cancellation';
import { describeFailure, isCancellation } from './describe-failure';
import { Observable } from './observable';
import { filePatchRequest } from './patch';
import { isUntrackedDirectory } from './presentation';
import { type Say, sourceSay } from './say';
import type {
  ChangedFile,
  CheckoutChanges,
  CheckoutLocation,
  FilePatch,
  FilePatchRequest,
  PatchLimit,
} from './types';

export type FileDiffPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded'; readonly patch: FilePatch }
  | { readonly kind: 'failed'; readonly message: string };

/** Whether the patch on screen can grow, or the Host's ceiling was reached. */
export type Truncation = 'none' | 'canLoadMore' | 'tooLarge';

/** How the Changes list now disagrees with the patch on screen. */
export type ListChange = 'changed' | 'removed' | null;

export interface FileDiffState {
  readonly file: ChangedFile;
  readonly phase: FileDiffPhase;
  readonly isRefreshing: boolean;
  readonly readAt: number | null;
  /** A refresh failure accompanies the earlier patch instead of replacing it. */
  readonly refreshError: string | null;
  readonly listChange: ListChange;
  readonly truncation: Truncation;
}

export interface FileDiffOptions {
  readonly read: (request: FilePatchRequest, signal: CancelSignal) => Promise<FilePatch>;
  readonly now?: () => number;
  readonly say?: Say;
  readonly translate?: Translate;
}

function sameCounts(lhs: ChangedFile['lineCounts'], rhs: ChangedFile['lineCounts']): boolean {
  if (lhs === null || rhs === null) return lhs === rhs;
  if (lhs.kind === 'binary' || rhs.kind === 'binary') return lhs.kind === rhs.kind;
  return lhs.added === rhs.added && lhs.removed === rhs.removed;
}

/** One open file's in-memory patch, independent of the Changes list's reads. */
export class FileDiffStore extends Observable<FileDiffState> {
  private hasRead = false;
  private readSeq = 0;
  private active: { promise: Promise<void>; cancel: () => void } | null = null;
  private loadedLimit: PatchLimit = 'initial';
  /** Null means a complete list no longer contains this path. */
  private latestListFile: ChangedFile | null;
  private loadedListFile: ChangedFile | null;
  private readonly now: () => number;
  private readonly say: Say;

  constructor(
    file: ChangedFile,
    readonly checkout: CheckoutLocation,
    private readonly options: FileDiffOptions,
  ) {
    super({
      file,
      phase: { kind: 'loading' },
      isRefreshing: false,
      readAt: null,
      refreshError: null,
      listChange: null,
      truncation: 'none',
    });
    this.latestListFile = file;
    this.loadedListFile = file;
    this.now = options.now ?? Date.now;
    this.say = options.say ?? sourceSay;
  }

  async appear(): Promise<void> {
    if (!this.hasRead) await this.refresh();
  }

  /** Reads this file alone at the initial cap, even after Load More. */
  refresh(): Promise<void> {
    return this.performRead('initial');
  }

  reload(): Promise<void> {
    return this.refresh();
  }

  loadMore(): Promise<void> {
    return this.getState().truncation === 'canLoadMore'
      ? this.performRead('extended')
      : Promise.resolve();
  }

  /**
   * A list read never replaces the open patch or its reading position. Raw path identity also
   * covers files beyond the display cap.
   */
  noteListRefresh(changes: CheckoutChanges): void {
    if (changes.checkout.topLevel !== this.checkout.topLevel) return;
    const { file } = this.getState();
    const latest = changes.files.find((candidate) => candidate.path === file.path);
    if (latest) {
      this.latestListFile = latest;
    } else {
      // Neither a capped status nor a collapsed untracked directory proves a file disappeared.
      if (changes.isStatusTruncated) return;
      if (changes.files.some((f) => isUntrackedDirectory(f) && file.path.startsWith(f.path)))
        return;
      this.latestListFile = null;
    }
    this.updateListChange();
  }

  /** Closing or replacing the file cancels its request and invalidates any late reply. */
  cancel(): void {
    this.readSeq += 1;
    this.active?.cancel();
    this.active = null;
    this.set({ isRefreshing: false });
  }

  private updateListChange(): void {
    const loaded = this.loadedListFile;
    const latest = this.latestListFile;
    let listChange: ListChange = null;
    if (loaded === null && latest === null) listChange = null;
    else if (latest === null) listChange = 'removed';
    else if (loaded === null) listChange = 'changed';
    else if (
      !sameCounts(loaded.lineCounts, latest.lineCounts) ||
      loaded.kind !== latest.kind ||
      loaded.originalPath !== latest.originalPath
    ) {
      listChange = 'changed';
    }
    this.set({ listChange });
  }

  private truncationFor(patch: FilePatch, limit: PatchLimit): Truncation {
    if (!patch.isTruncated) return 'none';
    return limit === 'initial' ? 'canLoadMore' : 'tooLarge';
  }

  private performRead(limit: PatchLimit): Promise<void> {
    const listed = this.latestListFile;
    const requested = listed ?? this.getState().file;
    const request = filePatchRequest(requested, this.checkout, limit);
    if (this.active || request === null) return this.active?.promise ?? Promise.resolve();
    const id = ++this.readSeq;
    const cancellation = createCancellation();
    this.set({ refreshError: null, isRefreshing: this.getState().phase.kind === 'loaded' });
    const handle = { promise: Promise.resolve(), cancel: () => cancellation.cancel() };
    this.active = handle;
    handle.promise = (async () => {
      try {
        const patch = await this.options.read(request, cancellation.signal);
        if (this.readSeq !== id || cancellation.signal.aborted) return;
        this.loadedLimit = limit;
        this.loadedListFile = listed;
        this.hasRead = true;
        this.set({
          phase: { kind: 'loaded', patch },
          readAt: this.now(),
          file: requested,
          truncation: this.truncationFor(patch, limit),
        });
        this.updateListChange();
      } catch (thrown) {
        // A cancelled first read remains eligible for the next appearance.
        if (isCancellation(thrown) || this.readSeq !== id || cancellation.signal.aborted) return;
        this.hasRead = true;
        const message = describeFailure(thrown, this.say, this.options.translate);
        if (this.getState().phase.kind === 'loaded') this.set({ refreshError: message });
        else this.set({ phase: { kind: 'failed', message } });
      } finally {
        if (this.active === handle) {
          this.active = null;
          this.set({ isRefreshing: false });
        }
      }
    })();
    return handle.promise;
  }

  /** The limit the loaded patch was read at (for tests and the too-large message). */
  get patchLimit(): PatchLimit {
    return this.loadedLimit;
  }
}

/** Owns file presentation without making a file read part of list refresh. */
export class FileDiffPresenter extends Observable<{ current: FileDiffStore | null }> {
  constructor(private readonly options: FileDiffOptions) {
    super({ current: null });
  }

  get current(): FileDiffStore | null {
    return this.getState().current;
  }

  open(file: ChangedFile, checkout: CheckoutLocation): void {
    if (filePatchRequest(file, checkout) === null) return;
    const current = this.current;
    if (
      current &&
      current.getState().file.path === file.path &&
      current.checkout.topLevel === checkout.topLevel
    ) {
      return;
    }
    this.close();
    this.set({ current: new FileDiffStore(file, checkout, this.options) });
  }

  close(): void {
    this.current?.cancel();
    if (this.current) this.set({ current: null });
  }

  listDidRefresh(changes: CheckoutChanges): void {
    const current = this.current;
    if (current && current.checkout.topLevel !== changes.checkout.topLevel) this.close();
    this.current?.noteListRefresh(changes);
  }
}
