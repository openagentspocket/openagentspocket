import type { CancelSignal } from '../hosts/cancellation';

export type RemoteFileKind = 'file' | 'directory' | 'symlink' | 'other';

export interface FileStat {
  kind: RemoteFileKind | null;
  size: number | null;
  /** Seconds since 1970. */
  modifiedAt: number | null;
}

export interface FileEntry extends FileStat {
  name: string;
}

export interface FileListing {
  entries: FileEntry[];
  /** More entries matched than one listing shows. */
  truncated: boolean;
  /** The folder was not read to its end. */
  scanIncomplete: boolean;
}

/** Bytes moved so far by one download or upload. */
export interface TransferProgress {
  transferredBytes: number;
  /** What the Host reported before the transfer; 0 when it reported nothing. */
  totalBytes: number;
}

/** 0..1, or null while the total is unknown. */
export function progressFraction(progress: TransferProgress): number | null {
  if (progress.totalBytes <= 0) return null;
  return Math.min(1, progress.transferredBytes / progress.totalBytes);
}

export type ProgressSink = (progress: TransferProgress) => void;

export interface DownloadRequest {
  path: string;
  /** A local uri the host creates, replacing any file there. */
  destination: string;
  /** A file larger than this when stat'ed, or that grows past it while read, fails `tooLarge`. */
  maximumBytes: number;
}

export interface UploadRequest {
  /** A local uri in app storage. */
  source: string;
  byteCount: number;
  directory: string;
  name: string;
  /** Replace a file of that name instead of failing `alreadyExists`. A folder or link never is. */
  replacesExisting: boolean;
}

/** Everything the file browser needs from one Host, so the store stays off the SSH types. */
export interface FileBrowserHost {
  homeDirectory(): Promise<string>;
  list(path: string): Promise<FileListing>;
  /** Follows links; null when the path does not exist. */
  status(path: string): Promise<FileStat | null>;
  download(request: DownloadRequest, progress: ProgressSink, signal: CancelSignal): Promise<void>;
  upload(request: UploadRequest, progress: ProgressSink, signal: CancelSignal): Promise<void>;
  rename(path: string, newName: string): Promise<void>;
  delete(path: string, kind: RemoteFileKind): Promise<void>;
  /** Which of `candidates`, names `directory` lists, git ignores; a failure means "dim nothing". */
  ignoredNames(directory: string, candidates: readonly string[]): Promise<ReadonlySet<string>>;
}

export interface LocalWriter {
  append(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

/** The phone's sandbox, as the file browser sees it. Implemented over expo-file-system in the app. */
export interface LocalFiles {
  /** `<root>/<folder>/<name>`'s folder is created private; returns the file's uri. */
  makeDestination(folder: string, name: string): Promise<string>;
  /** Creates (replacing) the file at `uri` for appending. */
  openWriter(uri: string): Promise<LocalWriter>;
  readAll(uri: string): Promise<Uint8Array>;
  /** Size in bytes, null when it does not exist or is not a regular file. */
  size(uri: string): Promise<number | null>;
  /** Copies a picked document into private app storage as `<folder>/<name>`; returns its uri. */
  copyInto(sourceUri: string, folder: string, name: string): Promise<string>;
  /** Removes a file, or a folder with everything in it. Missing is fine. */
  remove(uri: string): Promise<void>;
  /** Removes a whole folder made by `makeDestination` or `copyInto`. Missing is fine. */
  removeFolder(folder: string): Promise<void>;
  /** The folder holding a destination uri (for removing one download's copy). */
  parentOf(uri: string): string;
}
