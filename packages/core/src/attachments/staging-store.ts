import { message } from '../errors/text';
import { type Cancellation, CancelledError, createCancellation } from '../hosts/cancellation';
import {
  type AttachmentPresentation,
  attachmentFailure,
  attachmentPresentation,
} from './presentation';
import {
  type AttachmentCommand,
  AttachmentError,
  type AttachmentFailure,
  type AttachmentOperationEvent,
  type AttachmentSource,
  type AttachmentStager,
  type AttachmentState,
  type ComposerAttachmentPort,
  isBusy,
  type PendingAttachment,
  type PreparedAttachment,
} from './types';

export interface ComposerStagingOptions {
  /** One uploader per medium; both end in the same SFTP staging. */
  stage: { image: AttachmentStager; file: AttachmentStager };
  composer: ComposerAttachmentPort;
  /** Terminal outcomes of each `begin`. */
  onOperationEvent?: (event: AttachmentOperationEvent) => void;
}

type Disposition = 'user' | 'background';

function isCancellation(thrown: unknown): boolean {
  return (
    thrown instanceof CancelledError ||
    (thrown instanceof AttachmentError && thrown.kind === 'cancelled')
  );
}

/**
 * Owns one cross-media Composer staging workflow: pick, prepare locally, upload over SFTP, hand the
 * attachment to the Composer. Prepared local files belong to this store, except a shown preview,
 * which goes to the Composer with the attachment; completed Host files outlive it (ADR 0005). Port
 * of Swift `ComposerStagingStore`, which typed the path into the draft instead.
 */
export class ComposerStagingStore {
  private current: AttachmentState = { kind: 'idle' };
  private readonly listeners = new Set<() => void>();
  private prepared: PreparedAttachment | undefined;
  private running: Promise<void> | undefined;
  /** The most recent operation's promise, kept after it settles so `settled` can await it. */
  private latest: Promise<void> | undefined;
  private cancellation: Cancellation | undefined;
  private operationId = 0;
  private disposition: Disposition | undefined;
  private attachment: PendingAttachment | null = null;

  constructor(private readonly options: ComposerStagingOptions) {}

  get state(): AttachmentState {
    return this.current;
  }

  /** A failure that can still be retried stands until Retry or Dismiss: a new pick would drop it. */
  get canBegin(): boolean {
    const failure =
      this.current.kind === 'failed' || this.current.kind === 'backgroundInterrupted'
        ? this.current.failure
        : undefined;
    return !isBusy(this.current) && !failure?.isRetryable;
  }

  /** The attachment in flight or stopped by a failure; null once it reached the Composer. */
  get pending(): PendingAttachment | null {
    return this.current.kind === 'idle' ? null : this.attachment;
  }

  get presentation(): AttachmentPresentation | null {
    return attachmentPresentation(this.current);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Starts one attachment. Returns the operation id, or null when busy. Retry keeps the id. */
  begin(source: AttachmentSource): number | null {
    if (!this.canBegin || this.running) return null;
    if (this.current.kind === 'failed' || this.current.kind === 'backgroundInterrupted') {
      this.publish({ kind: 'dismissed', id: this.operationId });
    }
    void this.discardPrepared();
    this.disposition = undefined;
    this.attachment = { medium: source.medium, ...source.label };
    this.operationId += 1;
    const id = this.operationId;
    this.cancellation = createCancellation();
    this.setState({ kind: 'preparing', medium: source.medium });
    this.running = this.runSelection(source, id);
    this.latest = this.running;
    return id;
  }

  async perform(command: AttachmentCommand): Promise<void> {
    switch (command) {
      case 'cancel':
        return this.cancel();
      case 'retry':
        return this.retry();
      case 'dismiss':
        return this.dismiss();
    }
  }

  /** The app went to the background: an in-flight upload ends interrupted, with Retry. */
  didEnterBackground(): void {
    if (!isBusy(this.current) || !this.running) return;
    this.disposition = 'background';
    this.cancellation?.cancel();
  }

  /** The owner is going away: cancel, wait for the work to settle, discard local copies. */
  async leave(): Promise<void> {
    const abandoned = this.operationId;
    const previous = this.current;
    this.operationId += 1;
    const task = this.running;
    this.running = undefined;
    this.disposition = undefined;
    this.cancellation?.cancel();
    await task;
    await this.discardPrepared();
    this.setState({ kind: 'idle' });
    if (isBusy(previous)) this.publish({ kind: 'cancelled', id: abandoned });
    else if (previous.kind === 'failed' || previous.kind === 'backgroundInterrupted') {
      this.publish({ kind: 'dismissed', id: abandoned });
    }
  }

  /** Resolves when the current operation, if any, has finished. */
  async settled(): Promise<void> {
    await this.latest;
  }

  private cancel(): void {
    if (!isBusy(this.current) || !this.running) return;
    this.disposition = 'user';
    this.cancellation?.cancel();
  }

  private retry(): void {
    const state = this.current;
    if (state.kind !== 'failed' && state.kind !== 'backgroundInterrupted') return;
    const prepared = this.prepared;
    if (!state.failure.isRetryable || this.running || !prepared) return;
    if (prepared.medium !== state.failure.medium) return;
    this.disposition = undefined;
    this.cancellation = createCancellation();
    this.setState({
      kind: 'uploading',
      medium: prepared.medium,
      progress: { transferredBytes: 0, totalBytes: prepared.byteCount },
    });
    this.running = this.runUpload(prepared, this.operationId);
    this.latest = this.running;
  }

  private async dismiss(): Promise<void> {
    if (isBusy(this.current)) return;
    const previous = this.current;
    const id = this.operationId;
    await this.discardPrepared();
    this.setState({ kind: 'idle' });
    if (previous.kind === 'failed' || previous.kind === 'backgroundInterrupted') {
      this.publish({ kind: 'dismissed', id });
    }
  }

  private async runSelection(source: AttachmentSource, id: number): Promise<void> {
    const signal = this.cancellation?.signal;
    let unclaimed: PreparedAttachment | undefined;
    try {
      if (!signal) return;
      const prepared = await source.prepare(signal);
      unclaimed = prepared;
      if (signal.aborted) throw new CancelledError();
      if (id !== this.operationId) {
        await prepared.remove();
        return;
      }
      this.prepared = prepared;
      unclaimed = undefined;
      this.setState({
        kind: 'uploading',
        medium: prepared.medium,
        progress: { transferredBytes: 0, totalBytes: prepared.byteCount },
      });
      await this.runUpload(prepared, id);
    } catch (thrown) {
      await unclaimed?.remove();
      await this.finishWithError(thrown, source.medium, id);
    }
  }

  private async runUpload(prepared: PreparedAttachment, id: number): Promise<void> {
    const signal = this.cancellation?.signal;
    if (!signal) return;
    try {
      const path = await this.options.stage[prepared.medium](prepared, {
        signal,
        onProgress: (progress) => {
          if (id !== this.operationId || this.current.kind !== 'uploading') return;
          this.setState({ kind: 'uploading', medium: this.current.medium, progress });
        },
      });
      if (signal.aborted) throw new CancelledError();
      await this.finishSuccess(path, id);
    } catch (thrown) {
      await this.finishWithError(thrown, prepared.medium, id);
    }
  }

  private async finishSuccess(path: string, id: number): Promise<void> {
    if (id !== this.operationId) return;
    this.running = undefined;
    this.disposition = undefined;
    const { attachment } = this;
    if (attachment?.previewUri === undefined) await this.discardPrepared();
    else this.prepared = undefined;
    if (attachment) this.options.composer.attach({ ...attachment, hostPath: path });
    this.setState({ kind: 'idle' });
    this.publish({ kind: 'completed', id, path });
  }

  private async finishWithError(
    thrown: unknown,
    medium: AttachmentFailure['medium'],
    id: number,
  ): Promise<void> {
    if (id !== this.operationId) return;
    this.running = undefined;

    if (isCancellation(thrown) || this.disposition !== undefined) {
      const background = this.disposition === 'background';
      this.disposition = undefined;
      if (background) {
        const failure: AttachmentFailure = {
          medium,
          message: message(
            medium === 'image'
              ? 'Image upload paused when Agentico moved to the background.'
              : 'File upload paused when Agentico moved to the background.',
          ),
          isRetryable: this.prepared !== undefined,
        };
        this.setState({ kind: 'backgroundInterrupted', failure });
        this.publish({ kind: 'failed', id, retryable: failure.isRetryable });
      } else {
        await this.discardPrepared();
        this.setState({ kind: 'idle' });
        this.publish({ kind: 'cancelled', id });
      }
      return;
    }

    const failure = attachmentFailure(thrown, medium);
    if (!failure.isRetryable) await this.discardPrepared();
    this.setState({ kind: 'failed', failure });
    this.publish({ kind: 'failed', id, retryable: failure.isRetryable });
  }

  private async discardPrepared(): Promise<void> {
    const prepared = this.prepared;
    this.prepared = undefined;
    try {
      await prepared?.remove();
    } catch {
      // A leftover local copy lives in the app's cache, which the system trims.
    }
  }

  private setState(state: AttachmentState): void {
    this.current = state;
    for (const listener of this.listeners) listener();
  }

  private publish(event: AttachmentOperationEvent): void {
    this.options.onOperationEvent?.(event);
  }
}
