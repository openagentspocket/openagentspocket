// What a conversation engine follows (Swift ChatTranscriptSource): a transcript file on the Host,
// which `TranscriptFollower` reads, or a program's store read by query (ADR 0025). Offsets order the
// records a source hands on, as a file's byte offsets do.
//
// One operation at a time per source: its owner runs a call and waits for it, so at most one read
// per conversation is in flight.

import type { ChatUnavailableReason } from '../timeline/reasons';
import type { FollowChange, OlderPage } from './follower';
import type { ChatHostFiles } from './host-files';
import type { ChatLine } from './lines';
import type { ChatOutputReference } from './types';

export interface ChatTranscriptSource {
  /** What `following(path)` shows and the saved document is filed under. */
  readonly path: string;
  /** What identifies the conversation for the cache: a file's first bytes, or the session a store names. */
  readonly head: Uint8Array | null;
  /** How far the conversation has been read. */
  readonly readOffset: number;
  /** Where the earliest loaded record starts; 0 once the first record is loaded, null while that is not known yet. */
  readonly windowStart: number | null;
  /** Whether records older than the window remain. */
  readonly hasOlder: boolean;
  /** The length one request for older history asks of its first page, and the largest it doubles to. */
  readonly olderPageLengths: { first: number; maximum: number };
  /** The most bytes a request the timeline makes by itself may read; null for no bound. */
  readonly automaticOlderSearch: number | null;
  /** The request begun last has read as far back as one request may. */
  readonly olderSearchExhausted: boolean;
  /** Reads the conversation's newest records. Null when it is not there. */
  open(files: ChatHostFiles): Promise<ChatLine[] | null>;
  /** One look for what changed since the last read. */
  poll(files: ChatHostFiles): Promise<FollowChange>;
  /** Reads the records just before the window, oldest first: at least `length` bytes when given, never more than `limit`. */
  loadOlder(
    files: ChatHostFiles,
    length?: number | null,
    limit?: number | null,
  ): Promise<OlderPage>;
  /** Starts one request for older history, which `olderSearchExhausted` then measures. */
  beginOlderSearch(): void;
  /** One recorded line again, for an expanded tool row; null when gone. Throws for a line found too long to read. */
  line(reference: ChatOutputReference, files: ChatHostFiles): Promise<ChatLine | null>;
}

/**
 * Thrown by a source whose conversation cannot be read, for a reason Chat explains. The engine
 * stops following with it.
 */
export class ChatSourceUnavailable extends Error {
  override readonly name = 'ChatSourceUnavailable';

  constructor(readonly reason: ChatUnavailableReason) {
    super(`ChatSourceUnavailable.${reason.kind}`);
  }
}

/** Thrown by `line(...)` for a recorded line found too long to read only once it is asked for. */
export class ChatOutputTooLong extends Error {
  override readonly name = 'ChatOutputTooLong';

  constructor() {
    super('ChatOutputTooLong');
  }
}
