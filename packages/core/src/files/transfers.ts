import { message } from '../errors/text';
import { type Cancellation, CancelledError, createCancellation } from '../hosts/cancellation';
import type { FileBrowserDownloads } from './downloads';
import { FileBrowserError, failureText, mutationFailureText, tooLarge } from './errors';
import { type FileBrowserItem, isNameUsable, itemLooksSecret } from './item';
import { FILE_LIMITS } from './limits';
import { keepingBoth, nameProblem } from './path';
import type { FileBrowserHost, LocalFiles, TransferProgress } from './ports';
import type { FilePreparer } from './preparer';
import type {
  CollisionChoice,
  FileBrowserState,
  FileBrowserUpload,
  FileIntent,
  FileTransfer,
} from './store-types';

/** What the transfers need from the store that owns them. */
export interface TransferContext {
  readonly host: FileBrowserHost;
  readonly local: LocalFiles;
  readonly downloads: FileBrowserDownloads;
  readonly preparer: FilePreparer;
  get(): FileBrowserState;
  set(patch: Partial<FileBrowserState>): void;
  isClosed(): boolean;
  /** Reloads `directory` after a change, if it is still the one on screen. */
  reload(directory: string): void;
}

const NOTHING: TransferProgress = { transferredBytes: 0, totalBytes: 0 };
const isCancel = (error: unknown) => error instanceof CancelledError;
const canReplace = (kind: string | null) => kind !== 'directory' && kind !== 'symlink';

/** The browser's downloads and uploads: one transfer at a time, each cancellable. */
export class FileTransfers {
  private nextId = 1;
  private transferCancel: Cancellation | undefined;
  /** Secret-looking files the user already agreed to download. */
  private readonly confirmedSecrets = new Set<string>();

  constructor(private readonly ctx: TransferContext) {}

  /** Cancels whatever is in flight (the store is closing). */
  cancelAll() {
    this.transferCancel?.cancel();
  }

  /**
   * Starts a download, after asking first for a file that may hold secrets, one above the preview
   * cap, or a share or save above the confirmation cap; refuses one above the download cap.
   */
  requestFile(item: FileBrowserItem, intent: FileIntent) {
    this.request(item, intent, false);
  }

  /** Goes ahead with the pending download; either size dialog answers for the size. */
  confirmPendingDownload(as?: FileIntent) {
    const pending = this.ctx.get().pendingDownload;
    if (!pending) return;
    this.ctx.set({ pendingDownload: null });
    if (pending.reason === 'secret') this.confirmedSecrets.add(pending.item.path);
    this.request(pending.item, as ?? pending.intent, pending.reason !== 'secret');
  }

  cancelPendingDownload() {
    this.ctx.set({ pendingDownload: null });
  }

  private request(item: FileBrowserItem, intent: FileIntent, sizeConfirmed: boolean) {
    if (this.ctx.isClosed() || this.ctx.get().transfer) return;
    if (!isNameUsable(item))
      return this.ctx.set({ notice: new FileBrowserError('unusableName').text });
    const size = item.size ?? 0;
    if (size > FILE_LIMITS.downloadBytes) {
      return this.ctx.set({ notice: tooLarge(FILE_LIMITS.downloadBytes).text });
    }
    if (itemLooksSecret(item) && !this.confirmedSecrets.has(item.path)) {
      return this.ctx.set({ pendingDownload: { item, intent, reason: 'secret' } });
    }
    if (!sizeConfirmed) {
      if (intent === 'preview' && size > FILE_LIMITS.previewBytes) {
        return this.ctx.set({ pendingDownload: { item, intent, reason: 'large' } });
      }
      if (intent !== 'preview' && size > FILE_LIMITS.confirmBytes) {
        return this.ctx.set({ pendingDownload: { item, intent, reason: 'largeTransfer' } });
      }
    }
    this.download(item, intent);
  }

  cancelTransfer() {
    this.transferCancel?.cancel();
    this.ctx.set({ transfer: null });
  }

  /** The delivery was shown, shared or exported: its copy goes. */
  finishDelivery() {
    const { delivery } = this.ctx.get();
    if (!delivery) return;
    this.ctx.set({ delivery: null });
    void this.ctx.downloads.remove(delivery.uri);
  }

  private beginTransfer(transfer: Omit<FileTransfer, 'id'>): { id: number; cancel: Cancellation } {
    const id = this.nextId++;
    const cancel = createCancellation();
    this.transferCancel = cancel;
    this.ctx.set({ transfer: { ...transfer, id } });
    return { id, cancel };
  }

  private progressSink(id: number) {
    return (progress: TransferProgress) => {
      const { transfer } = this.ctx.get();
      if (transfer?.id === id) this.ctx.set({ transfer: { ...transfer, progress } });
    };
  }

  private download(item: FileBrowserItem, intent: FileIntent) {
    const { id, cancel } = this.beginTransfer({
      direction: 'download',
      name: item.name,
      preparing: false,
      progress: { transferredBytes: 0, totalBytes: item.size ?? 0 },
    });
    const run = async () => {
      let destination: string;
      try {
        destination = await this.ctx.downloads.makeDestination(item.name);
      } catch {
        throw new FileBrowserError('localStorageFailed');
      }
      try {
        await this.ctx.host.download(
          { path: item.path, destination, maximumBytes: FILE_LIMITS.downloadBytes },
          this.progressSink(id),
          cancel.signal,
        );
      } catch (error) {
        void this.ctx.downloads.remove(destination);
        throw error;
      }
      if (this.ctx.get().transfer?.id !== id) return void this.ctx.downloads.remove(destination);
      this.ctx.set({ transfer: null, delivery: { uri: destination, name: item.name, intent } });
    };
    run().catch((error) => {
      if (this.ctx.get().transfer?.id !== id) return;
      this.ctx.set({ transfer: null, notice: isCancel(error) ? null : failureText(error) });
    });
  }

  /** Copies a picked document into app storage, then uploads it under `name`. */
  importFile(sourceUri: string, name: string, extension: string) {
    this.prepareUpload(async () => {
      const prepared = await this.ctx.preparer.prepare(sourceUri, extension);
      return { source: prepared.uri, byteCount: prepared.byteCount, name };
    });
  }

  /** Uploads a photo already re-encoded by the picker as "Photo <date> <time>.<ext>". */
  importPhoto(sourceUri: string, extension: string, now: Date = new Date()) {
    this.importFile(sourceUri, photoUploadName(now, extension), extension);
  }

  private prepareUpload(prepare: () => Promise<FileBrowserUpload>) {
    if (this.ctx.get().transfer || this.ctx.get().isMutating) return;
    const { id } = this.beginTransfer({
      direction: 'upload',
      name: '',
      preparing: true,
      progress: NOTHING,
    });
    prepare().then(
      (upload) => {
        if (this.ctx.get().transfer?.id !== id) return this.discard(upload);
        this.ctx.set({ transfer: null });
        this.upload(upload);
      },
      (error) => {
        if (this.ctx.get().transfer?.id !== id) return;
        this.ctx.set({ transfer: null, notice: isCancel(error) ? null : failureText(error) });
      },
    );
  }

  /** Uploads a prepared file to the current folder; a taken name asks Replace / Keep Both / Cancel. */
  upload(upload: FileBrowserUpload) {
    const { currentPath, transfer, isMutating, items } = this.ctx.get();
    if (currentPath === null || transfer || isMutating) {
      if (!this.ctx.isClosed())
        this.ctx.set({
          notice: message('Another change is running. Upload again when it finishes.'),
        });
      return this.discard(upload);
    }
    const problem = nameProblem(upload.name);
    if (problem) {
      this.ctx.set({ notice: problem });
      return this.discard(upload);
    }
    const existing = items.find((item) => item.name === upload.name);
    if (existing) {
      return this.ctx.set({
        pendingCollision: {
          upload,
          existingKind: existing.kind,
          canReplace: canReplace(existing.kind),
        },
      });
    }
    this.startUpload(upload, false);
  }

  resolveCollision(choice: CollisionChoice) {
    const collision = this.ctx.get().pendingCollision;
    if (!collision) return;
    this.ctx.set({ pendingCollision: null });
    if (choice === 'cancel') return this.discard(collision.upload);
    if (choice === 'keepBoth') {
      const taken = new Set(this.ctx.get().items.map((item) => item.name));
      return this.startUpload(
        { ...collision.upload, name: keepingBoth(collision.upload.name, taken) },
        false,
      );
    }
    if (!collision.canReplace) {
      this.ctx.set({
        notice:
          collision.existingKind === 'symlink'
            ? message('A link is never replaced by an upload.')
            : message('A folder cannot be replaced by a file.'),
      });
      return this.discard(collision.upload);
    }
    this.startUpload(collision.upload, true);
  }

  private startUpload(upload: FileBrowserUpload, replacing: boolean) {
    const directory = this.ctx.get().currentPath;
    if (directory === null || this.ctx.get().transfer || this.ctx.get().isMutating)
      return this.discard(upload);
    const { id, cancel } = this.beginTransfer({
      direction: 'upload',
      name: upload.name,
      preparing: false,
      progress: { transferredBytes: 0, totalBytes: upload.byteCount },
    });
    this.ctx.set({ isMutating: true });
    const run = async () => {
      let keepsSource = false;
      try {
        await this.ctx.host.upload(
          {
            source: upload.source,
            byteCount: upload.byteCount,
            directory,
            name: upload.name,
            replacesExisting: replacing,
          },
          this.progressSink(id),
          cancel.signal,
        );
      } catch (error) {
        if (error instanceof FileBrowserError && error.kind === 'alreadyExists' && !replacing) {
          // The listing was stale: ask again with what is there now.
          keepsSource = this.ctx.get().transfer?.id === id;
          this.ctx.set({
            pendingCollision: keepsSource ? { upload, existingKind: null, canReplace: true } : null,
          });
        } else if (this.ctx.get().transfer?.id === id && !isCancel(error)) {
          this.ctx.set({ notice: mutationFailureText(error) });
        }
      }
      if (!keepsSource) this.discard(upload);
      this.ctx.set({
        isMutating: false,
        transfer: this.ctx.get().transfer?.id === id ? null : this.ctx.get().transfer,
      });
      this.ctx.reload(directory);
    };
    void run();
  }

  discard(upload: FileBrowserUpload) {
    void this.ctx.local.remove(upload.source).catch(() => {});
  }
}

const pad = (value: number) => String(value).padStart(2, '0');

/** "Photo 2026-10-31 14.05.09.jpg": the upload name of a picked photo, in the phone's local time. */
export function photoUploadName(now: Date, extension: string): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
  return `Photo ${date} ${time}.${extension}`;
}
