import type { Translate } from '../errors/text';
import { type CancelSignal, createCancellation } from '../hosts/cancellation';
import type { ByteString } from './bytes';
import { describeFailure, isCancellation } from './describe-failure';
import { Observable } from './observable';
import { type Say, sourceSay } from './say';
import type { UntrackedDirectoryListing, UntrackedDirectoryRequest } from './types';

export type Expansion =
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded'; readonly listing: UntrackedDirectoryListing }
  | { readonly kind: 'failed'; readonly message: string };

/**
 * Which untracked directories are expanded, and what their listing returned. A successful Changes
 * read drops every listing still in flight. Collapsing one directory drops only its own listing.
 */
export class UntrackedDirectoryExpansions extends Observable<{
  expansions: ReadonlyMap<ByteString, Expansion>;
}> {
  /** Bumped only by `collapseAll`; an individual toggle does not invalidate other directories. */
  private generation = 0;
  private nextRequestId = 0;
  /** The listing each directory waits on. Absent after it collapses. */
  private readonly requestIds = new Map<ByteString, number>();
  private readonly cancels = new Map<ByteString, () => void>();

  constructor(
    private readonly list: (
      request: UntrackedDirectoryRequest,
      signal: CancelSignal,
    ) => Promise<UntrackedDirectoryListing>,
    private readonly say: Say = sourceSay,
    private readonly translate?: Translate,
  ) {
    super({ expansions: new Map() });
  }

  expansion(directory: ByteString): Expansion | undefined {
    return this.getState().expansions.get(directory);
  }

  private put(directory: ByteString, expansion: Expansion | null): void {
    const next = new Map(this.getState().expansions);
    if (expansion) next.set(directory, expansion);
    else next.delete(directory);
    this.set({ expansions: next });
  }

  collapseAll(): void {
    for (const cancel of this.cancels.values()) cancel();
    this.cancels.clear();
    this.requestIds.clear();
    this.generation += 1;
    if (this.getState().expansions.size > 0) this.set({ expansions: new Map() });
  }

  /** Expands `directory`, or collapses it when it is already open. */
  async toggle(directory: ByteString, topLevel: ByteString): Promise<void> {
    if (this.getState().expansions.has(directory)) {
      this.cancels.get(directory)?.();
      this.cancels.delete(directory);
      this.requestIds.delete(directory);
      this.put(directory, null);
      return;
    }
    const started = this.generation;
    const requestId = ++this.nextRequestId;
    this.requestIds.set(directory, requestId);
    this.put(directory, { kind: 'loading' });
    const cancellation = createCancellation();
    this.cancels.set(directory, () => cancellation.cancel());
    const accepts = () =>
      started === this.generation &&
      this.requestIds.get(directory) === requestId &&
      this.getState().expansions.get(directory)?.kind === 'loading';
    try {
      const listing = await this.list({ topLevel, directory }, cancellation.signal);
      if (accepts() && !cancellation.signal.aborted)
        this.put(directory, { kind: 'loaded', listing });
    } catch (thrown) {
      if (!accepts()) return;
      if (isCancellation(thrown)) this.put(directory, null);
      else {
        this.put(directory, {
          kind: 'failed',
          message: describeFailure(thrown, this.say, this.translate),
        });
      }
    } finally {
      if (this.requestIds.get(directory) === requestId) this.cancels.delete(directory);
    }
  }
}
