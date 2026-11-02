import { type Cancellation, type CancelSignal, createCancellation } from '../hosts/cancellation';
import { ChangesAutoRefresh } from './auto-refresh';
import { isCancellation } from './describe-failure';
import { FileDiffPresenter } from './file-diff-store';
import { gated, Observable } from './observable';
import { type Say, sourceSay } from './say';
import { failureUpdate } from './store-failure';
import {
  APPEARANCE_SETTLE_MS,
  type ChangesState,
  type ChangesStoreOptions,
  sameFiles,
  UNAVAILABLE,
} from './store-types';
import type { ChangedFile, CheckoutLocation } from './types';
import { UntrackedDirectoryExpansions } from './untracked-expansions';

/**
 * One Checkout's Changes document: the Checkout containing an Agent's current directory, read
 * over an exec seam. The Agents list keeps a store per Agent for its row's totals; open Changes
 * get a store of their own that closing discards. Status edges refresh the list; lazy file reads
 * stay independent.
 */
export class ChangesStore extends Observable<ChangesState> {
  readonly autoRefresh: ChangesAutoRefresh;
  readonly fileDiff: FileDiffPresenter;
  readonly untrackedDirectories: UntrackedDirectoryExpansions;
  /** Gates 'Checkout Changes updated.'; false for a list row's store. */
  announcesAutomaticUpdates = true;
  /** True while this store's automatic reads should wait (no row shows the Agent, or open Changes read in its place). */
  defersAutomaticRefresh: (() => boolean) | null = null;

  private readonly now: () => number;
  private readonly say: Say;
  private activeRead: Promise<void> | null = null;
  private readCancellation: Cancellation | null = null;
  private readSeq = 0;
  private dispatchedReadId: number | null = null;
  private lastDirectory: string | null = null;
  /** The directory whose read the loaded document is. */
  private readDirectory: string | null = null;
  private hasRead = false;
  private rowFollowId = 0;
  private rowTimer: unknown = null;
  private readonly read: ChangesStoreOptions['read'];

  constructor(private readonly options: ChangesStoreOptions) {
    super({
      phase: { kind: 'loading' },
      isRefreshing: false,
      directoryPrefix: '',
      timedOutKeepingContent: false,
      readAt: null,
      freshness: null,
    });
    this.now = options.now ?? Date.now;
    this.say = options.say ?? sourceSay;
    this.read = options.read;
    this.autoRefresh = new ChangesAutoRefresh(options.agentStatus, options.clock, {
      isReading: () => this.activeRead !== null,
      defers: () => this.defersAutomaticRefresh?.() === true,
      runRefresh: () => void this.refresh(true),
      changed: () => this.publishFreshness(),
    });
    const common = { now: this.now, say: this.say, translate: options.translate };
    this.fileDiff = new FileDiffPresenter({
      ...common,
      read: gated(options.gate, options.readPatch ?? UNAVAILABLE),
    });
    this.untrackedDirectories = new UntrackedDirectoryExpansions(
      gated(options.gate, options.listUntrackedDirectory ?? UNAVAILABLE),
      this.say,
      options.translate,
    );
  }

  /** The Checkout the document describes; views key their content on it. */
  get checkout(): CheckoutLocation | null {
    const { phase } = this.getState();
    return phase.kind === 'loaded' ? phase.changes.checkout : null;
  }

  private publishFreshness(): void {
    const { phase, readAt } = this.getState();
    const stale =
      phase.kind === 'loaded' &&
      readAt !== null &&
      (this.autoRefresh.status === 'working' || this.autoRefresh.readWasWhileWorking);
    const freshness = stale ? readAt : null;
    if (freshness !== this.getState().freshness) this.set({ freshness });
  }

  private update(next: Partial<ChangesState>): void {
    this.set(next);
    this.publishFreshness();
  }

  /** Reads once per store; returning to the view reads nothing new once a read has completed. */
  async appear(): Promise<void> {
    this.autoRefresh.start();
    if (!this.hasRead) await this.refresh();
  }

  /** Reads the Checkout again, keeping the current document on screen. */
  refresh(automatic = false): Promise<void> {
    return this.startRead(automatic) ?? Promise.resolve();
  }

  /** Starts a read owned by the store; null while one is running. */
  startRead(automatic = false): Promise<void> | null {
    if (this.activeRead) return null;
    const directory = this.options.directory() ?? this.lastDirectory;
    if (directory === null) {
      this.update({
        phase: { kind: 'failed', message: this.say('This Agent has no working directory.') },
      });
      return null;
    }
    this.lastDirectory = directory;
    const id = ++this.readSeq;
    const cancellation = createCancellation();
    this.readCancellation = cancellation;
    this.set({ isRefreshing: this.getState().phase.kind !== 'loading' });
    const run = gated(this.options.gate, (_: null, signal: CancelSignal) =>
      this.readAndApply(directory, id, automatic, signal),
    );
    const task = (async () => {
      try {
        await run(null, cancellation.signal);
      } catch {
        // Cancellation while waiting never enters the Transport.
      }
      if (this.readSeq !== id) return;
      this.activeRead = null;
      this.set({ isRefreshing: false });
      if (!cancellation.signal.aborted) this.autoRefresh.runPending(false);
    })();
    this.activeRead = task;
    return task;
  }

  private stale(id: number, signal: CancelSignal): boolean {
    return this.readSeq !== id || signal.aborted;
  }

  /** Called inside the Host gate, which is released on local completion. */
  private async readAndApply(
    directory: string,
    id: number,
    automatic: boolean,
    signal: CancelSignal,
  ): Promise<void> {
    if (this.stale(id, signal)) return;
    this.autoRefresh.readSawWorking = this.autoRefresh.status === 'working';
    this.dispatchedReadId = id;
    try {
      const result = await this.read({ directory }, signal);
      if (this.stale(id, signal)) return;
      const previous = this.getState().phase;
      const hadRead = this.hasRead;
      this.untrackedDirectories.collapseAll();
      this.readDirectory = directory;
      this.hasRead = true;
      this.autoRefresh.readWasWhileWorking =
        this.autoRefresh.readSawWorking || this.autoRefresh.status === 'working';
      this.update({
        phase: { kind: 'loaded', changes: result.changes },
        directoryPrefix: result.directoryPrefix,
        timedOutKeepingContent: false,
        readAt: this.now(),
      });
      this.fileDiff.listDidRefresh(result.changes);
      if (automatic && hadRead && this.announcesAutomaticUpdates) {
        const before = previous.kind === 'loaded' ? previous.changes.files : null;
        if (!before || !sameFiles(before, result.changes.files)) {
          this.options.announce?.('Checkout Changes updated.');
        }
      }
    } catch (thrown) {
      if (isCancellation(thrown)) return;
      if (this.stale(id, signal)) return;
      this.autoRefresh.dropPending();
      this.hasRead = true;
      const failure = failureUpdate(
        thrown,
        this.getState().phase.kind === 'loaded',
        this.say,
        this.options.translate,
      );
      // The Agent's directory is in no Checkout now, so a diff left open would describe one that
      // is gone and hide this state. Other failures say nothing about the Checkout.
      if (failure.closeDiff) this.fileDiff.close();
      this.update(failure.update);
    }
  }

  cancelRead(): void {
    this.readSeq += 1;
    this.readCancellation?.cancel();
    this.activeRead = null;
    this.set({ isRefreshing: false });
  }

  /** Whether the running read has already entered the Transport. */
  get isReadDispatched(): boolean {
    return this.activeRead !== null && this.dispatchedReadId === this.readSeq;
  }

  /**
   * Whether this store's next read lands in the Checkout `other` shows. Only git's answer counts:
   * `other` read the very directory this store reads, or this store's own read of it found the
   * same Checkout. A path inside a top level can belong to a nested repository.
   */
  readsSameCheckout(other: ChangesStore): boolean {
    const checkout = other.checkout;
    const directory = this.options.directory() ?? this.lastDirectory;
    if (!checkout || directory === null) return false;
    if (other.readDirectory === directory) return true;
    const own = this.getState().phase;
    return (
      own.kind === 'loaded' &&
      this.readDirectory === directory &&
      own.changes.checkout.topLevel === checkout.topLevel
    );
  }

  /**
   * Closing Changes hands their read to the list row's store: when it is a newer successful read
   * of the Checkout this store would read now, this store takes it, keeping its own prefix.
   */
  adoptNewerRead(other: ChangesStore): void {
    const theirs = other.getState();
    if (theirs.phase.kind !== 'loaded' || theirs.readAt === null) return;
    if (theirs.readAt <= (this.getState().readAt ?? Number.NEGATIVE_INFINITY)) return;
    if (!this.readsSameCheckout(other)) return;
    this.untrackedDirectories.collapseAll();
    this.readDirectory = other.readDirectory;
    this.autoRefresh.readWasWhileWorking = other.autoRefresh.readWasWhileWorking;
    this.update({ phase: theirs.phase, readAt: theirs.readAt, timedOutKeepingContent: false });
    this.fileDiff.listDidRefresh(theirs.phase.changes);
  }

  /**
   * Opening Changes starts from the list row's latest read of the same directory, so the list
   * shows at once while `appear()` reads again. A read that timed out keeping older content is
   * not a starting point.
   */
  seed(other: ChangesStore): void {
    const theirs = other.getState();
    if (
      this.getState().phase.kind !== 'loading' ||
      this.activeRead ||
      theirs.timedOutKeepingContent
    )
      return;
    if (theirs.phase.kind !== 'loaded' || theirs.readAt === null) return;
    if (other.readDirectory === null || other.readDirectory !== this.options.directory()) return;
    this.readDirectory = other.readDirectory;
    this.autoRefresh.readWasWhileWorking = other.autoRefresh.readWasWhileWorking;
    this.update({
      phase: theirs.phase,
      directoryPrefix: theirs.directoryPrefix,
      readAt: theirs.readAt,
    });
  }

  /**
   * Back from Changes of this Checkout, which read in this store's place. When their last read
   * answered every exit from Working and Back adopted it, the waiting refresh is done; otherwise
   * it runs where the Agent is now, or waits for a row to show it.
   */
  resumeAutomaticRefresh(other: ChangesStore): void {
    if (!this.autoRefresh.pending) return;
    const readAt = this.getState().readAt;
    if (
      other.hasAnsweredEveryWorkingExit &&
      readAt !== null &&
      readAt === other.getState().readAt &&
      this.readsSameCheckout(other)
    ) {
      this.autoRefresh.pending = false;
    } else {
      this.autoRefresh.runPending(this.activeRead !== null);
    }
  }

  private get hasAnsweredEveryWorkingExit(): boolean {
    return (
      this.getState().phase.kind === 'loaded' &&
      !this.autoRefresh.pending &&
      !this.autoRefresh.isDebouncing &&
      this.activeRead === null &&
      !this.getState().timedOutKeepingContent
    );
  }

  /** Runs a read the status edges queued, if nothing defers it. */
  runPendingAutomaticRefresh(): void {
    this.autoRefresh.runPending(this.activeRead !== null);
  }

  /**
   * The Agents list's reads for a row's totals: one once the row has settled, then one for each
   * exit from Working, until the returned stop function runs. No timers: nothing else reads.
   */
  followForRowTotals(): () => void {
    const id = ++this.rowFollowId;
    this.autoRefresh.start();
    this.rowTimer = this.options.clock.setTimeout(() => {
      this.rowTimer = null;
      if (this.rowFollowId !== id) return;
      // Closed Changes may have handed over a read in the meantime.
      if (this.getState().readAt === null) {
        this.autoRefresh.pending = true;
        this.runPendingAutomaticRefresh();
      }
    }, APPEARANCE_SETTLE_MS);
    return () => {
      if (this.rowFollowId === id) this.stopFollowingForRowTotals();
    };
  }

  /**
   * The Agent left the catalog. A read still queued at the Host gate is dropped, but one git is
   * already running keeps the gate until it answers, so the next read queues behind it.
   */
  stopFollowingForRowTotals(): void {
    this.rowFollowId += 1;
    if (this.rowTimer !== null) this.options.clock.clearTimeout(this.rowTimer);
    this.rowTimer = null;
    this.autoRefresh.stop();
    if (this.activeRead && !this.isReadDispatched) this.cancelRead();
  }

  /**
   * The list and the diff pushed over it share the status stream: it runs while any of them is on
   * screen, and the last to leave ends it. Returns the release function.
   */
  followAgentStatus(): () => void {
    this.autoRefresh.start();
    const generation = this.autoRefresh.statusGeneration;
    this.autoRefresh.followers += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.autoRefresh.followers -= 1;
      if (this.autoRefresh.followers === 0 && this.autoRefresh.statusGeneration === generation) {
        this.cancel();
      }
    };
  }

  /** Back invalidates replies immediately, even if a transport ignores cancellation. */
  cancel(): void {
    this.autoRefresh.stop();
    this.cancelRead();
    this.fileDiff.close();
    this.untrackedDirectories.collapseAll();
  }

  openDiff(file: ChangedFile): void {
    const checkout = this.checkout;
    if (checkout) this.fileDiff.open(file, checkout);
  }

  closeDiff(): void {
    this.fileDiff.close();
  }

  /** Lists the files inside an untracked directory, or collapses it. */
  async toggleDirectory(file: ChangedFile): Promise<void> {
    const checkout = this.checkout;
    if (checkout) await this.untrackedDirectories.toggle(file.path, checkout.topLevel);
  }
}
