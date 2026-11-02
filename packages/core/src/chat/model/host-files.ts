// The port through which Chat reads files on the Host (Swift ChatHostFiles). Core never imports
// modules/ssh: the app adapts its SFTP client to this interface, tests use FakeHostFiles.

export type HostFileKind = 'regular' | 'directory' | 'symlink';

export interface HostFileStatus {
  size: number | null;
  /** Whole seconds: SFTP v3 has no finer time. */
  modificationTime: number | null;
  kind: HostFileKind | null;
}

export interface HostFileRange {
  path: string;
  offset: number;
  maxBytes: number;
}

export interface HostFileSlice {
  data: Uint8Array;
  /** The file's size as the Host reported it with the read; null when the file is gone. */
  length: number | null;
}

export interface HostFileListingRequest {
  directory: string;
  kinds: HostFileKind[];
  namePrefix?: string;
  maximumEntries: number;
  maximumScanned?: number;
}

export interface HostFileListing {
  entries: { name: string; undecodedName?: boolean }[];
  truncated: boolean;
  scanIncomplete: boolean;
}

export interface ChatHostFiles {
  /** Null when the path does not exist. */
  status(path: string): Promise<HostFileStatus | null>;
  /** Null when the directory does not exist. */
  list(request: HostFileListingRequest): Promise<HostFileListing | null>;
  read(range: HostFileRange): Promise<HostFileSlice>;
  home(): Promise<string>;
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** Reads `[start, end)` in chunks; null when the file is gone. Stops early at the end of the file. */
export async function readBytes(
  files: ChatHostFiles,
  path: string,
  start: number,
  end: number,
  chunk: number,
): Promise<Uint8Array | null> {
  const parts: Uint8Array[] = [];
  let offset = start;
  while (offset < end) {
    const slice = await files.read({ path, offset, maxBytes: Math.min(chunk, end - offset) });
    if (slice.length === null) return null;
    if (slice.data.length === 0) break;
    parts.push(slice.data);
    offset += slice.data.length;
  }
  return concatBytes(parts);
}

export type FirstLine =
  | { type: 'line'; data: Uint8Array }
  | { type: 'unterminated' }
  | { type: 'tooLong' };

/** The file's first line, reading 8 times more until it ends or `limit` bytes. */
export async function readFirstLine(
  files: ChatHostFiles,
  path: string,
  initialBytes: number,
  limit: number,
): Promise<FirstLine | null> {
  let length = initialBytes;
  for (;;) {
    const data = await readBytes(files, path, 0, length, 256 << 10);
    if (data === null) return null;
    const newline = data.indexOf(0x0a);
    if (newline >= 0) return { type: 'line', data: data.subarray(0, newline) };
    if (data.length < length) return { type: 'unterminated' };
    if (length >= limit) return { type: 'tooLong' };
    length = Math.min(limit, length * 8);
  }
}
