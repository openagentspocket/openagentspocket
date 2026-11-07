import { describe, expect, it } from 'vitest';
import { failWith } from '../events/failure';
import { attachmentPresentation } from './presentation';
import { ComposerStagingStore } from './staging-store';
import {
  type AbortSignalLike,
  AttachmentError,
  type AttachmentLabel,
  type AttachmentMedium,
  type AttachmentOperationEvent,
  type AttachmentProgress,
  type AttachmentSource,
  type AttachmentStager,
  type PreparedAttachment,
  type StagedAttachment,
} from './types';

class Gate<T = void> {
  promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (error: unknown) => void;
  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function rejectOnAbort(signal: AbortSignalLike, pending: Promise<never>): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new AttachmentError('cancelled')), {
      once: true,
    });
    pending.catch(reject);
  });
}

function harness() {
  const removed: string[] = [];
  const attached: StagedAttachment[] = [];
  const events: AttachmentOperationEvent[] = [];
  const stageCalls: string[] = [];
  const stage = {
    behavior: async (
      _p: PreparedAttachment,
      _o: { onProgress(p: AttachmentProgress): void; signal: AbortSignalLike },
    ): Promise<string> => '/tmp/agentico.AB/stage-1/image.png',
  };
  const stager: AttachmentStager = (prepared, options) => {
    stageCalls.push(prepared.medium);
    return stage.behavior(prepared, options);
  };
  const store = new ComposerStagingStore({
    stage: { image: stager, file: stager },
    composer: { attach: (attachment) => attached.push(attachment) },
    onOperationEvent: (event) => events.push(event),
  });
  const source = (
    medium: AttachmentMedium = 'image',
    byteCount = 1000,
    prepare?: (signal: AbortSignalLike) => Promise<void>,
    label: AttachmentLabel = { name: 'doc.txt' },
  ): AttachmentSource => ({
    medium,
    label,
    prepare: async (signal) => {
      await prepare?.(signal);
      return { medium, byteCount, remove: () => void removed.push(medium) };
    },
  });
  return { store, stage, removed, attached, events, stageCalls, source };
}

describe('ComposerStagingStore', () => {
  it('prepares, uploads and hands the Composer the attachment, leaving nothing on show', async () => {
    const h = harness();
    const id = h.store.begin(h.source('file', 1000, undefined, { name: 'notes.md' }));
    expect(id).toBe(1);
    expect(h.store.state.kind).toBe('preparing');
    expect(h.store.pending).toEqual({ medium: 'file', name: 'notes.md' });
    await h.store.settled();
    expect(h.attached).toEqual([
      { medium: 'file', name: 'notes.md', hostPath: '/tmp/agentico.AB/stage-1/image.png' },
    ]);
    expect(h.store.state.kind).toBe('idle');
    expect(h.store.presentation).toBeNull();
    expect(h.store.pending).toBeNull();
    expect(h.removed).toEqual(['file']); // the local copy is discarded after staging
    expect(h.events).toEqual([
      { kind: 'completed', id: 1, path: '/tmp/agentico.AB/stage-1/image.png' },
    ]);
    expect(h.store.canBegin).toBe(true);
  });

  it('leaves a shown preview on the phone: the Composer now owns that copy', async () => {
    const h = harness();
    const label = { name: 'IMG_1.jpg', previewUri: 'file:///cache/IMG_1.jpg' };
    h.store.begin(h.source('image', 10, undefined, label));
    expect(h.store.pending).toEqual({ medium: 'image', ...label });
    await h.store.settled();
    expect(h.attached).toMatchObject([label]);
    expect(h.removed).toEqual([]);
  });

  it('keeps a retryable failure standing: another attachment waits for Retry or Dismiss', async () => {
    const h = harness();
    h.stage.behavior = async () => {
      throw new AttachmentError('transferFailed');
    };
    h.store.begin(h.source('image', 10, undefined, { name: 'a.jpg' }));
    await h.store.settled();
    expect(h.store.pending?.name).toBe('a.jpg');
    expect(h.store.canBegin).toBe(false);
    expect(h.store.begin(h.source('file'))).toBeNull();
    await h.store.perform('dismiss');
    expect(h.store.pending).toBeNull();
    expect(h.store.canBegin).toBe(true);
  });

  it('refuses a second begin while busy', async () => {
    const h = harness();
    const gate = new Gate();
    h.store.begin(h.source('image', 10, () => gate.promise));
    expect(h.store.begin(h.source('file'))).toBeNull();
    gate.resolve();
    await h.store.settled();
  });

  it('reports upload progress', async () => {
    const h = harness();
    const gate = new Gate<string>();
    h.stage.behavior = async (_p, options) => {
      options.onProgress({ transferredBytes: 250, totalBytes: 1000 });
      return gate.promise;
    };
    h.store.begin(h.source('image', 1000));
    await tick();
    const shown = attachmentPresentation(h.store.state);
    expect(h.store.state).toMatchObject({ kind: 'uploading', progress: { transferredBytes: 250 } });
    expect(shown?.title).toEqual({ key: 'Uploading Image… %lld%%', args: ['25'] });
    expect(shown?.commands).toEqual(['cancel']);
    gate.resolve('/tmp/x/f');
    await h.store.settled();
  });

  it('cancels an upload back to idle, discards the local copy and reports it', async () => {
    const h = harness();
    h.stage.behavior = (_p, { signal }) => rejectOnAbort(signal, new Promise(() => {}));
    h.store.begin(h.source('image'));
    await tick();
    await h.store.perform('cancel');
    await h.store.settled();
    expect(h.store.state.kind).toBe('idle');
    expect(h.removed).toEqual(['image']);
    expect(h.events).toEqual([{ kind: 'cancelled', id: 1 }]);
    expect(h.attached).toEqual([]);
  });

  it('cancels while preparing and removes the prepared copy', async () => {
    const h = harness();
    const gate = new Gate();
    h.store.begin(h.source('file', 5, () => gate.promise));
    await h.store.perform('cancel');
    gate.resolve();
    await h.store.settled();
    expect(h.store.state.kind).toBe('idle');
    expect(h.removed).toEqual(['file']);
    expect(h.stageCalls).toEqual([]);
  });

  it('keeps a transfer failure retryable and retry reuses the id and the prepared copy', async () => {
    const h = harness();
    let attempts = 0;
    h.stage.behavior = async () => {
      attempts += 1;
      if (attempts === 1) throw new AttachmentError('transferFailed');
      return '/tmp/agentico.AB/stage-2/doc.txt';
    };
    const id = h.store.begin(h.source('file'));
    await h.store.settled();
    expect(h.store.state.kind).toBe('failed');
    expect(attachmentPresentation(h.store.state)?.commands).toEqual(['retry', 'dismiss']);
    expect(h.removed).toEqual([]);
    await h.store.perform('retry');
    await h.store.settled();
    expect(h.attached).toHaveLength(1);
    expect(h.events).toEqual([
      { kind: 'failed', id: id ?? -1, retryable: true },
      { kind: 'completed', id: id ?? -1, path: '/tmp/agentico.AB/stage-2/doc.txt' },
    ]);
  });

  it('discards the local copy of a non-retryable failure and offers only Dismiss', async () => {
    const h = harness();
    h.stage.behavior = async () => {
      throw new AttachmentError('sftpUnavailable');
    };
    h.store.begin(h.source('image'));
    await h.store.settled();
    expect(attachmentPresentation(h.store.state)?.commands).toEqual(['dismiss']);
    expect(h.removed).toEqual(['image']);
    await h.store.perform('retry');
    expect(h.store.state.kind).toBe('failed');
    await h.store.perform('dismiss');
    expect(h.store.state.kind).toBe('idle');
    expect(h.events.map((event) => event.kind)).toEqual(['failed', 'dismissed']);
  });

  it('maps a lost connection to a retryable failure', async () => {
    const h = harness();
    h.stage.behavior = async () => {
      throw failWith({ kind: 'sshUnreachable', detail: 'gone' });
    };
    h.store.begin(h.source('image'));
    await h.store.settled();
    expect(h.store.state).toMatchObject({ kind: 'failed', failure: { isRetryable: true } });
  });

  it('ends interrupted with Retry when the app goes to the background mid-upload', async () => {
    const h = harness();
    let attempts = 0;
    h.stage.behavior = (_p, { signal }) => {
      attempts += 1;
      if (attempts > 1) return Promise.resolve('/tmp/agentico.AB/stage-3/image.png');
      return rejectOnAbort(signal, new Promise(() => {}));
    };
    h.store.begin(h.source('image'));
    await tick();
    h.store.didEnterBackground();
    await h.store.settled();
    expect(h.store.state).toMatchObject({
      kind: 'backgroundInterrupted',
      failure: { isRetryable: true },
    });
    expect(h.removed).toEqual([]);
    await h.store.perform('retry');
    await h.store.settled();
    expect(h.attached).toHaveLength(1);
  });

  it('leave cancels the work, discards the copy and ignores the late result', async () => {
    const h = harness();
    const gate = new Gate<string>();
    h.stage.behavior = (_p, { signal }) => {
      signal.addEventListener('abort', () => gate.resolve('/tmp/late/f'), { once: true });
      return gate.promise;
    };
    h.store.begin(h.source('image'));
    await tick();
    await h.store.leave();
    expect(h.store.state.kind).toBe('idle');
    expect(h.attached).toEqual([]);
    expect(h.events).toEqual([{ kind: 'cancelled', id: 1 }]);
    expect(h.removed).toEqual(['image']);
    expect(h.store.begin(h.source('image'))).toBe(3);
  });

  it('maps preparation errors to their own user-facing failure', async () => {
    const h = harness();
    const bad = (kind: AttachmentError['kind']): AttachmentSource => ({
      medium: 'image',
      label: { name: 'a.jpg' },
      prepare: async () => {
        throw new AttachmentError(kind);
      },
    });
    h.store.begin(bad('invalidImage'));
    await h.store.settled();
    expect(h.store.state).toMatchObject({
      kind: 'failed',
      failure: {
        message: { key: 'The selected item is not a readable image.' },
        isRetryable: false,
      },
    });
    h.store.begin(bad('sourceTooLarge'));
    await h.store.settled();
    expect(h.store.state).toMatchObject({
      failure: { message: { key: 'The selected image is too large to decode safely.' } },
    });
  });
});
