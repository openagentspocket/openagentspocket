// What one conversation looks like after its engine's last step (Swift ChatConversationSnapshot),
// Reasons are data (`timeline/reasons`): the UI words them.

import type { TransportError } from '../../errors';
import { type ChatTranscript, emptyTranscript } from '../model/types';
import type { ChatUnavailableReason } from '../timeline/reasons';

export type ChatPhase =
  /** Looking for the transcript; entries the device kept may show. */
  | { type: 'locating' }
  | { type: 'following'; path: string }
  | { type: 'unavailable'; reason: ChatUnavailableReason };

/** Whether earlier messages exist above the ones shown. */
export type ChatConversationOlder =
  | { type: 'reachedStart' }
  | { type: 'available' }
  | { type: 'loading' }
  | { type: 'failed'; error: TransportError | null };

export interface ChatConversationSnapshot {
  phase: ChatPhase;
  transcript: ChatTranscript;
  /** Every entry shown comes from the device: the Host has not confirmed them on this visit. */
  isFromCache: boolean;
  older: ChatConversationOlder;
  /**
   * Earlier messages load only when the user asks: a request the timeline made by itself, for a
   * program that bounds such requests, read its limit without reaching a turn's opener.
   */
  olderAwaitsUser: boolean;
  /** The last read failed this way. Whatever was read before still shows. */
  readFailure: TransportError | null;
  /** How far the transcript has been read. */
  readOffset: number;
  /** Bumped when offsets read before may now locate other records. */
  layoutGeneration: number;
  /** Bumped whenever anything above changes. */
  revision: number;
}

export function initialSnapshot(): ChatConversationSnapshot {
  return {
    phase: { type: 'locating' },
    transcript: emptyTranscript(),
    isFromCache: false,
    older: { type: 'reachedStart' },
    olderAwaitsUser: false,
    readFailure: null,
    readOffset: 0,
    layoutGeneration: 0,
    revision: 0,
  };
}

/** Why an expanded row's output could not be read again. */
export type ChatToolOutputFailure =
  /** No transcript is open to read it from. */
  | { type: 'notFollowing' }
  /** Its line is longer than the fetch cap. */
  | { type: 'tooLong' }
  /** The line no longer holds the call: the file was rewritten or is gone. */
  | { type: 'gone' }
  | { type: 'unreadable'; error: TransportError };

/** Whether reading again could succeed: a line too long, or no longer there, stays so. */
export function canRetryOutput(failure: ChatToolOutputFailure): boolean {
  return failure.type === 'notFollowing' || failure.type === 'unreadable';
}
