// Follows one JSON Lines transcript on the Host (Swift TranscriptFollower): opens at its tail,
// reads what the Agent appends, pages backwards on request, and notices when the file was
// rewritten in place or replaced.
//
// SFTP v3 has no inode and whole-second modification times, so identity is judged by content:
// the file's first bytes and the bytes just before the read position. Offsets advance by the bytes
// actually received, never by a reported length, and a line is handed on only once its newline
// arrived. One operation at a time per follower: the owner serializes calls.

import { bytesEqual, type ChatHostFiles, concatBytes, readBytes } from './host-files';
import { type ChatLine, JsonlLineFramer } from './lines';
import type { ChatOutputReference } from './types';

export interface FollowerLimits {
  /** How much of the file's end is read on open. */
  tailWindow: number;
  /** The largest single read. */
  readChunk: number;
  /** The most one poll reads before handing lines on. */
  pollBudget: number;
  /** The first backward page; it doubles while a line does not fit. */
  olderPage: number;
  /** The largest backward page held in memory. */
  maximumOlderPage: number;
  /** How far one request for older history reads back looking for the oldest turn's start. */
  olderSearch: number;
  /** The largest page such a search reads at once. */
  olderSearchPage: number;
  /** The most a search the timeline makes by itself reads; null: as the user's do. */
  automaticOlderSearch: number | null;
  /** How far the search for a long line's start goes before older history is unreadable. */
  lineStartSearch: number;
  anchorLength: number;
  /** How much of the file's start identifies it. */
  headLength: number;
  lineCap: number;
  prefixCap: number;
}

export const DEFAULT_FOLLOWER_LIMITS: FollowerLimits = {
  tailWindow: 1 << 20,
  readChunk: 256 << 10,
  pollBudget: 2 << 20,
  olderPage: 512 << 10,
  maximumOlderPage: 8 << 20,
  olderSearch: 32 << 20,
  olderSearchPage: 4 << 20,
  automaticOlderSearch: null,
  lineStartSearch: 64 << 20,
  anchorLength: 64,
  headLength: 4 << 10,
  lineCap: 8 << 20,
  prefixCap: 16 << 10,
};

export type FollowChange =
  | { type: 'unchanged' }
  | { type: 'appended'; lines: ChatLine[] }
  /** Rewritten in place (`replaced` false) or a different file (true): everything delivered is stale. */
  | { type: 'reset'; lines: ChatLine[]; replaced: boolean }
  /** The file is gone; the owner keeps what it showed and looks again. */
  | { type: 'missing' };

export type OlderPage =
  | { type: 'lines'; lines: ChatLine[] }
  | { type: 'headReached' }
  | { type: 'unreadable' }
  | { type: 'missing' }
  | { type: 'rewritten' }
  | { type: 'beyondLimit' };

/** Reads the conversation a file holds from its first bytes; null when they name none. */
export type HeadIdentity = (head: Uint8Array) => string | null;

function sameStart(a: Uint8Array | null, b: Uint8Array | null): boolean {
  if (!a || !b) return false;
  const shared = Math.min(a.length, b.length);
  return shared > 0 && bytesEqual(a.subarray(0, shared), b.subarray(0, shared));
}

/** Whether two reads of a file's first bytes name one conversation: by identity when it reads, else by content. */
export function sameConversationHeads(
  a: Uint8Array | null,
  b: Uint8Array | null,
  identity: HeadIdentity | null,
): boolean {
  if (identity && a && b) {
    const first = identity(a);
    const second = identity(b);
    if (first !== null && second !== null) return first === second;
  }
  return sameStart(a, b);
}

export class TranscriptFollower {
  readonly limits: FollowerLimits;
  framer: JsonlLineFramer;
  /** The next byte to read. */
  readOffset = 0;
  /** Where the earliest loaded line starts; 0 once the head is loaded; null while a line longer than the tail window is skipped. */
  windowStart: number | null = null;
  knownSize: number | null = null;
  modificationTime: number | null = null;
  head: Uint8Array | null = null;
  tailAnchor: Uint8Array = new Uint8Array(0);
  isOpen = false;
  olderSearchEnd: number | null = null;

  constructor(
    readonly path: string,
    limits: Partial<FollowerLimits> = {},
    private readonly identity: HeadIdentity | null = null,
  ) {
    this.limits = { ...DEFAULT_FOLLOWER_LIMITS, ...limits };
    this.framer = new JsonlLineFramer({
      startOffset: 0,
      lineCap: this.limits.lineCap,
      prefixCap: this.limits.prefixCap,
    });
  }

  get hasOlder(): boolean {
    return (this.windowStart ?? 0) > 0;
  }

  get hasUnreadBytes(): boolean {
    return this.knownSize !== null && this.knownSize > this.readOffset;
  }

  get olderPageLengths(): { first: number; maximum: number } {
    return { first: this.limits.olderPage, maximum: this.limits.olderSearchPage };
  }

  beginOlderSearch(): void {
    this.olderSearchEnd = this.windowStart ?? 0;
  }

  /** Spent once the window has moved back `olderSearch` bytes since the request began. */
  get olderSearchExhausted(): boolean {
    if (this.olderSearchEnd === null) return false;
    const end = this.olderSearchEnd;
    return end - Math.min(end, this.windowStart ?? 0) >= this.limits.olderSearch;
  }

  /** Reads the file's last `tailWindow` bytes. Null when the file is gone. */
  async open(files: ChatHostFiles): Promise<ChatLine[] | null> {
    // Any failure below leaves the follower closed, so the next poll reopens.
    this.isOpen = false;
    const status = await files.status(this.path);
    if (!status) return null;
    const size = status.size ?? 0;
    const start = size > this.limits.tailWindow ? size - this.limits.tailWindow : 0;
    this.framer = new JsonlLineFramer({
      startOffset: start,
      dropsLeadingFragment: start > 0,
      lineCap: this.limits.lineCap,
      prefixCap: this.limits.prefixCap,
    });
    this.readOffset = start;
    this.windowStart = this.framer.deliveryStart;
    this.tailAnchor = new Uint8Array(0);
    this.modificationTime = status.modificationTime;
    this.knownSize = size;
    const lines = await this.readForward(files, size, this.limits.tailWindow);
    if (lines === null) return null;
    const head = await readBytes(
      files,
      this.path,
      0,
      this.limits.headLength,
      this.limits.readChunk,
    );
    if (head === null) return null;
    this.head = head;
    this.isOpen = true;
    return lines;
  }

  /** One look at the file: a stat, then a read only when it changed. */
  async poll(files: ChatHostFiles): Promise<FollowChange> {
    if (!this.isOpen) return this.reload(files);
    const status = await files.status(this.path);
    if (!status) return { type: 'missing' };
    if (status.size !== null) {
      this.knownSize = status.size;
      if (status.size < this.readOffset) return this.reload(files);
      if (status.size === this.readOffset) {
        if (status.modificationTime === this.modificationTime) return { type: 'unchanged' };
        if (!(await this.anchorStillMatches(files))) return this.reload(files);
        this.modificationTime = status.modificationTime;
        return { type: 'unchanged' };
      }
    }
    const anchorStart = this.readOffset - this.tailAnchor.length;
    const end = status.size ?? this.readOffset + this.limits.pollBudget;
    const overlap = await readBytes(
      files,
      this.path,
      anchorStart,
      this.readOffset,
      this.limits.readChunk,
    );
    if (overlap === null) return { type: 'missing' };
    if (!bytesEqual(overlap, this.tailAnchor)) return this.reload(files);
    const lines = await this.readForward(files, end, this.limits.pollBudget);
    if (lines === null) return { type: 'missing' };
    this.modificationTime = status.modificationTime;
    return lines.length === 0 ? { type: 'unchanged' } : { type: 'appended', lines };
  }

  /**
   * Reads the lines just before the window, oldest first: at least `length` bytes when given, up to
   * the largest page, and never more than `limit` bytes.
   */
  async loadOlder(
    files: ChatHostFiles,
    length: number | null = null,
    limit: number | null = null,
  ): Promise<OlderPage> {
    const end = this.windowStart;
    if (end === null || end <= 0) return { type: 'headReached' };
    if (limit !== null && limit <= 0) return { type: 'beyondLimit' };
    const largest = Math.min(this.limits.maximumOlderPage, limit ?? Number.MAX_SAFE_INTEGER);
    let pageLength = Math.min(Math.max(this.limits.olderPage, length ?? 0), largest);
    let page: Uint8Array = new Uint8Array(0);
    let start = end;
    for (;;) {
      // A grown page reads only the bytes it adds.
      const newStart = end > pageLength ? end - pageLength : 0;
      const added = await readBytes(files, this.path, newStart, start, this.limits.readChunk);
      if (added === null) return { type: 'missing' };
      if (added.length !== start - newStart) return { type: 'rewritten' };
      page = concatBytes([added, page]);
      start = newStart;
      // `end` is a line start, so the byte before it ends a line.
      if (page[page.length - 1] !== 0x0a) return { type: 'rewritten' };
      const pageFramer = new JsonlLineFramer({
        startOffset: start,
        dropsLeadingFragment: start > 0,
        lineCap: this.limits.lineCap,
        prefixCap: this.limits.prefixCap,
      });
      const lines = pageFramer.append(page);
      if (start === 0) {
        this.windowStart = 0;
        return { type: 'lines', lines };
      }
      const first = pageFramer.deliveryStart;
      if (first !== null && first < end) {
        this.windowStart = first;
        return { type: 'lines', lines };
      }
      if (pageLength >= largest) {
        // The search for a longer line's start reads past any limit.
        if (limit !== null) return { type: 'beyondLimit' };
        return this.loadLineLongerThanPage(files, end, start);
      }
      pageLength = Math.min(pageLength * 2, largest);
    }
  }

  /** The line at the reference's offset, in the file it names or this one. */
  async line(reference: ChatOutputReference, files: ChatHostFiles): Promise<ChatLine | null> {
    const data = await readBytes(
      files,
      reference.path ?? this.path,
      reference.offset,
      reference.offset + reference.length,
      256 << 10,
    );
    if (data === null || data.length !== reference.length) return null;
    return { offset: reference.offset, length: data.length, data };
  }

  // MARK: Reading

  /** Reads from `readOffset` toward `end`, at most `budget` bytes. Null when the file disappeared mid-read. */
  private async readForward(
    files: ChatHostFiles,
    end: number,
    budget: number,
  ): Promise<ChatLine[] | null> {
    const lines: ChatLine[] = [];
    let remaining = budget;
    while (this.readOffset < end && remaining > 0) {
      const length = Math.min(this.limits.readChunk, remaining, end - this.readOffset);
      const slice = await files.read({
        path: this.path,
        offset: this.readOffset,
        maxBytes: length,
      });
      if (slice.length === null) return null;
      this.knownSize = slice.length;
      if (slice.data.length === 0) break;
      lines.push(...this.framer.append(slice.data));
      this.readOffset += slice.data.length;
      remaining -= slice.data.length;
      this.remember(slice.data);
      if (this.windowStart === null) this.windowStart = this.framer.deliveryStart;
    }
    return lines;
  }

  private remember(data: Uint8Array): void {
    const length = this.limits.anchorLength;
    const all = data.length >= length ? data : concatBytes([this.tailAnchor, data]);
    this.tailAnchor = all.slice(Math.max(0, all.length - length));
  }

  private async anchorStillMatches(files: ChatHostFiles): Promise<boolean> {
    if (this.tailAnchor.length === 0) return true;
    const start = this.readOffset - this.tailAnchor.length;
    const bytes = await readBytes(files, this.path, start, this.readOffset, this.limits.readChunk);
    return bytes !== null && bytesEqual(bytes, this.tailAnchor);
  }

  /**
   * The file no longer continues what was read. If it still holds the same conversation, it was
   * edited in place; otherwise it is a different file under the same name.
   */
  private async reload(files: ChatHostFiles): Promise<FollowChange> {
    const previousHead = this.head;
    const lines = await this.open(files);
    if (lines === null) return { type: 'missing' };
    return { type: 'reset', lines, replaced: !this.sameConversation(previousHead, this.head) };
  }

  private sameConversation(a: Uint8Array | null, b: Uint8Array | null): boolean {
    return sameConversationHeads(a, b, this.identity);
  }

  /**
   * The line ending at `end` began before the largest page. Searches backwards for its start without
   * keeping its bytes, then hands it on truncated to its first `prefixCap` bytes, as the framer would.
   */
  private async loadLineLongerThanPage(
    files: ChatHostFiles,
    end: number,
    pageStart: number,
  ): Promise<OlderPage> {
    let searchEnd = pageStart;
    let searched = 0;
    let lineStart: number | null = null;
    while (lineStart === null) {
      if (searchEnd === 0) {
        lineStart = 0;
        break;
      }
      if (searched >= this.limits.lineStartSearch) return { type: 'unreadable' };
      const step = Math.min(this.limits.readChunk, searchEnd);
      const start = searchEnd - step;
      const chunk = await readBytes(files, this.path, start, searchEnd, this.limits.readChunk);
      if (chunk === null) return { type: 'missing' };
      if (chunk.length !== step) return { type: 'rewritten' };
      const newline = chunk.lastIndexOf(0x0a);
      if (newline >= 0) lineStart = start + newline + 1;
      searchEnd = start;
      searched += step;
    }
    const length = end - 1 - lineStart;
    const prefix = await readBytes(
      files,
      this.path,
      lineStart,
      lineStart + Math.min(this.limits.prefixCap, length),
      this.limits.readChunk,
    );
    if (prefix === null) return { type: 'missing' };
    this.windowStart = lineStart;
    return { type: 'lines', lines: [{ offset: lineStart, length, data: prefix }] };
  }
}
