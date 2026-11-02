import type { Text } from '../errors/text';
import type { FileBrowserItem } from './item';
import type { FileKind, TransferProgress } from './ports';

/** What a downloaded file is for. */
export type FileIntent = 'preview' | 'share' | 'saveToFiles';

/** A transfer in flight, for the progress bar and its Cancel. */
export interface FileTransfer {
  id: number;
  direction: 'download' | 'upload';
  /** The file's name; empty while an upload is still being prepared. */
  name: string;
  preparing: boolean;
  progress: TransferProgress;
}

/**
 * A download waiting on the user: a size above the preview cap (`large`), a share or save above
 * the confirmation cap (`largeTransfer`), or a name that may hold secrets (`secret`).
 */
export interface PendingDownload {
  item: FileBrowserItem;
  intent: FileIntent;
  reason: 'large' | 'largeTransfer' | 'secret';
}

/** A local file in app storage, ready to go to the current folder. */
export interface FileBrowserUpload {
  source: string;
  byteCount: number;
  name: string;
}

/** An upload whose name is taken. A folder, or a link that may point at one, is never replaced. */
export interface PendingCollision {
  upload: FileBrowserUpload;
  /** What holds the name; null when the Host said the name is taken but the listing predates it. */
  existingKind: FileKind | null;
  canReplace: boolean;
}

export type CollisionChoice = 'replace' | 'keepBoth' | 'cancel';

/** A downloaded file handed to the viewer, the share sheet, or Files. */
export interface FileDelivery {
  uri: string;
  name: string;
  intent: FileIntent;
}

export interface FileBrowserState {
  hostName: string;
  /** Where the browser opened. Never deletable, like `/` and the home folder. */
  rootPath: string | null;
  homePath: string | null;
  /** The last folder listed successfully. */
  currentPath: string | null;
  items: readonly FileBrowserItem[];
  /** Names in the current folder git ignores; empty until git answers, and outside a repository. */
  ignoredNames: ReadonlySet<string>;
  truncated: boolean;
  scanIncomplete: boolean;
  isLoading: boolean;
  /** Why the last listing failed; the prior folder stays on screen. */
  loadError: Text | null;
  transfer: FileTransfer | null;
  /** An upload, rename or delete is running; the others wait for it. */
  isMutating: boolean;
  /** The last failed action, shown until dismissed. */
  notice: Text | null;
  pendingDownload: PendingDownload | null;
  pendingCollision: PendingCollision | null;
  delivery: FileDelivery | null;
}
