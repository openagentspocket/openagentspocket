// Follows a Workflow's journal on the Host from its first byte (Swift WorkflowJournalFollower), so
// every agent the run started is read, however long ago it started.
//
// Like TranscriptFollower it judges the file by content, since SFTP has no inode: the bytes just
// before the read position must still be there for what follows to continue them. Unlike it, the
// file is small and read whole, so a shrink or a changed anchor starts over at byte 0 rather than
// opening a tail window, and one read covers the anchor and the new bytes.
//
// One poll at a time per follower. A poll that fails before reading anything leaves the last good
// position; a restart it made is still reported by the next successful poll.

import { bytesEqual, type ChatHostFiles, readBytes } from './host-files';
import { type ChatLine, JsonlLineFramer } from './lines';

export interface JournalLimits {
  /** The largest single read; each runs under the transport deadline. */
  readChunk: number;
  anchorLength: number;
  /** Start lines are short; a result line can run to many kilobytes and only its start is kept. */
  lineCap: number;
  prefixCap: number;
  /** A journal larger than this is not read from its start; one already followed still reads appends. */
  maximumBytes: number;
}

export const DEFAULT_JOURNAL_LIMITS: JournalLimits = {
  readChunk: 64 << 10,
  anchorLength: 64,
  lineCap: 4 << 10,
  prefixCap: 1 << 10,
  maximumBytes: 8 << 20,
};

export type JournalChange =
  | { type: 'unchanged' }
  | { type: 'appended'; lines: ChatLine[] }
  /** The file no longer continues what was read: everything delivered before is stale. */
  | { type: 'restarted'; lines: ChatLine[] }
  | { type: 'missing' }
  | { type: 'tooLarge' };

export class WorkflowJournalFollower {
  readonly limits: JournalLimits;
  /** The next byte to read. */
  readOffset = 0;
  /** The size from the last look. */
  knownSize: number | null = null;
  /** The Host's modification time from the last look, in whole seconds. */
  modificationTime: number | null = null;
  private framer: JsonlLineFramer;
  /** The bytes just before `readOffset`. */
  private tailAnchor = new Uint8Array(0);
  private restartPending = false;

  constructor(
    readonly path: string,
    limits: Partial<JournalLimits> = {},
  ) {
    this.limits = { ...DEFAULT_JOURNAL_LIMITS, ...limits };
    this.framer = this.newFramer();
  }

  /** Whether everything the last look saw has been read. */
  get isCaughtUp(): boolean {
    return this.knownSize !== null && this.readOffset >= this.knownSize;
  }

  /** One look: a stat, then reads of at most `budget` new bytes. An unchanged file costs the stat alone. */
  async poll(files: ChatHostFiles, budget: number): Promise<JournalChange> {
    const status = await files.status(this.path);
    if (!status) return { type: 'missing' };
    if (status.size !== null) {
      if (status.size < this.readOffset) {
        this.restart();
      } else if (status.size === this.readOffset) {
        this.knownSize = status.size;
        if (status.modificationTime === this.modificationTime && !this.restartPending) {
          return { type: 'unchanged' };
        }
        // Written again at the same length: only the anchor tells.
        const anchor = await readBytes(
          files,
          this.path,
          this.readOffset - this.tailAnchor.length,
          this.readOffset,
          this.limits.readChunk,
        );
        if (anchor === null) return { type: 'missing' };
        if (bytesEqual(anchor, this.tailAnchor)) {
          this.modificationTime = status.modificationTime;
          return this.restartPending ? this.finish([]) : { type: 'unchanged' };
        }
        this.restart();
      }
      if (this.readOffset === 0 && status.size > this.limits.maximumBytes) {
        return { type: 'tooLarge' };
      }
    }
    const end = status.size ?? this.readOffset + budget;
    let lines: ChatLine[] = [];
    let remaining = budget;
    while (this.readOffset < end && remaining > 0) {
      const anchorLength = this.tailAnchor.length;
      const length = Math.min(this.limits.readChunk, remaining, end - this.readOffset);
      const slice = await files.read({
        path: this.path,
        offset: this.readOffset - anchorLength,
        maxBytes: anchorLength + length,
      });
      if (slice.length === null) return { type: 'missing' };
      if (this.readOffset === 0 && slice.length > this.limits.maximumBytes) {
        return { type: 'tooLarge' };
      }
      this.knownSize = slice.length;
      if (!bytesEqual(slice.data.subarray(0, anchorLength), this.tailAnchor)) {
        // Rewritten since the last look: read it again from the start, within what is left.
        this.restart();
        lines = [];
        continue;
      }
      const added = slice.data.subarray(anchorLength);
      if (added.length === 0) break;
      lines.push(...this.framer.append(added));
      this.readOffset += added.length;
      remaining -= added.length;
      this.remember(added);
    }
    this.modificationTime = status.modificationTime;
    return this.finish(lines);
  }

  private finish(lines: ChatLine[]): JournalChange {
    if (this.restartPending) {
      this.restartPending = false;
      return { type: 'restarted', lines };
    }
    return lines.length === 0 ? { type: 'unchanged' } : { type: 'appended', lines };
  }

  private newFramer(): JsonlLineFramer {
    return new JsonlLineFramer({
      startOffset: 0,
      lineCap: this.limits.lineCap,
      prefixCap: this.limits.prefixCap,
    });
  }

  private restart(): void {
    this.framer = this.newFramer();
    this.readOffset = 0;
    this.tailAnchor = new Uint8Array(0);
    this.restartPending = true;
  }

  private remember(added: Uint8Array): void {
    const length = this.limits.anchorLength;
    const joined = new Uint8Array(this.tailAnchor.length + added.length);
    joined.set(this.tailAnchor, 0);
    joined.set(added, this.tailAnchor.length);
    this.tailAnchor = joined.slice(Math.max(0, joined.length - length));
  }
}
