// JSON Lines framing (ported from Swift ChatLineFramer). A line is handed on only once its
// newline arrived; an overlong line keeps just a prefix, with its true length.

import { decodeUtf8 } from '../../events/utf8';

export interface ChatLine {
  /** Offset of the line's first byte. */
  offset: number;
  /** Full length in bytes, newline excluded. */
  length: number;
  /** The bytes, or only the first `prefixCap` bytes of a longer line. */
  data: Uint8Array;
}

export function isTruncatedLine(line: ChatLine): boolean {
  return line.data.length < line.length;
}

/** The offset just past the line's newline. */
export function lineEnd(line: ChatLine): number {
  return line.offset + line.length + 1;
}

export function lineText(line: ChatLine): string {
  return decodeUtf8(line.data);
}

export interface FramerOptions {
  /** File offset of the first byte appended. */
  startOffset: number;
  /** True when startOffset may fall inside a line: bytes up to the first newline are skipped. */
  dropsLeadingFragment?: boolean;
  lineCap?: number;
  prefixCap?: number;
}

const DEFAULT_LINE_CAP = 8 * 1024 * 1024;
const DEFAULT_PREFIX_CAP = 16 * 1024;

function concat(parts: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export class JsonlLineFramer {
  readonly lineCap: number;
  readonly prefixCap: number;
  processedEnd: number;
  deliveryStart: number | null;
  private pending: Uint8Array[] = [];
  private pendingKept = 0;
  private pendingLength = 0;
  private discardingFragment: boolean;

  constructor(options: FramerOptions) {
    this.lineCap = Math.max(1, options.lineCap ?? DEFAULT_LINE_CAP);
    this.prefixCap = Math.max(0, Math.min(options.prefixCap ?? DEFAULT_PREFIX_CAP, this.lineCap));
    this.processedEnd = options.startOffset;
    this.discardingFragment = (options.dropsLeadingFragment ?? false) && options.startOffset > 0;
    this.deliveryStart = this.discardingFragment ? null : options.startOffset;
  }

  get pendingByteCount(): number {
    return this.pendingLength;
  }

  /** Feeds the next bytes and returns the lines they complete, in order. */
  append(chunk: Uint8Array): ChatLine[] {
    const lines: ChatLine[] = [];
    let cursor = 0;
    while (cursor < chunk.length) {
      const newline = chunk.indexOf(0x0a, cursor);
      if (newline < 0) {
        this.absorb(chunk.subarray(cursor));
        break;
      }
      this.absorb(chunk.subarray(cursor, newline));
      const line = this.finishLine();
      if (line) lines.push(line);
      cursor = newline + 1;
    }
    return lines;
  }

  private absorb(bytes: Uint8Array): void {
    if (bytes.length === 0) return;
    if (this.discardingFragment) {
      this.processedEnd += bytes.length;
      return;
    }
    const room = this.pendingLength < this.lineCap ? this.lineCap - this.pendingLength : 0;
    this.pendingLength += bytes.length;
    if (room > 0) {
      const kept = bytes.slice(0, room);
      this.pending.push(kept);
      this.pendingKept += kept.length;
    }
    if (this.pendingLength > this.lineCap && this.pendingKept > this.prefixCap) {
      const prefix = concat(this.pending, this.pendingKept).subarray(0, this.prefixCap);
      this.pending = [prefix];
      this.pendingKept = prefix.length;
    }
  }

  private finishLine(): ChatLine | null {
    const start = this.processedEnd;
    if (this.discardingFragment) {
      this.discardingFragment = false;
      this.processedEnd += 1;
      this.deliveryStart = this.processedEnd;
      return null;
    }
    const length = this.pendingLength;
    const data = concat(this.pending, this.pendingKept);
    this.pending = [];
    this.pendingKept = 0;
    this.pendingLength = 0;
    this.processedEnd = start + length + 1;
    return length > 0 ? { offset: start, length, data } : null;
  }
}

/** Frames a whole file held in memory, for fixtures and small reads. */
export function frameLines(data: Uint8Array, options: Partial<FramerOptions> = {}): ChatLine[] {
  return new JsonlLineFramer({ startOffset: 0, ...options }).append(data);
}
