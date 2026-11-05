// What the Grok Build projection builds its entries from (the private types and helpers of Swift
// GrokTranscriptReducer): the open turn, a prompt's run of chunks, notices and prompt text.

import { notice as makeNotice, userMessage } from '../model/factories';
import { capPreview } from '../model/preview';
import type {
  ChatCommandInvocation,
  ChatEntryContent,
  ChatNotice,
  ChatOutputReference,
  NoticeKind,
} from '../model/types';
import type { GrokUpdateRecord, UserChunk } from './update-record';

/** The turn the latest counted prompt opened, until it ends. */
export interface OpenTurn {
  promptIndex: number | null;
  openerOffset: number;
  /** The entry that shows the prompt; null for one Grok wrote for itself, and until the prompt has something to show. */
  opener: string | null;
  /** The turn's position in `turns` once it placed an entry. */
  turn: number | null;
  promptMilliseconds: number | null;
  promptSeconds: number | null;
  firstTurnStartMs: number | null;
  /** A message, thought or tool record came after the prompt. */
  hasOutput: boolean;
}

/** The prompt's own clock, then the first agent record's `turnStartMs`, then the prompt's `timestamp`. */
export const startMs = (open: OpenTurn): number | null =>
  open.promptMilliseconds ??
  open.firstTurnStartMs ??
  (open.promptSeconds === null ? null : open.promptSeconds * 1000);

/** One prompt's chunks, while the next chunk may still join them. */
export interface UserRun {
  last: GrokUpdateRecord;
  lastChunk: UserChunk;
  offset: number;
  isHidden: boolean;
  /** The run opened the open turn. */
  opensTurn: boolean;
  command: ChatCommandInvocation | null;
  wasQueued: boolean;
  text: string;
  images: number;
  /** A cut line lost some of its text. */
  lostText: boolean;
  entry: number | null;
}

export function runContent(run: UserRun): ChatEntryContent | null {
  if (run.text !== '' || run.images > 0) {
    return {
      type: 'user',
      value: userMessage(run.text, {
        imageCount: run.images,
        command: run.command,
        wasQueued: run.wasQueued,
      }),
    };
  }
  return run.lostText
    ? { type: 'notice', value: makeNotice('system', 'Message exceeds the preview limit') }
    : null;
}

/**
 * Whether `chunk` continues this prompt: Grok writes a prompt of several content blocks as
 * consecutive chunks, numbered one after another, in one second.
 */
export function isContinued(run: UserRun, record: GrokUpdateRecord, chunk: UserChunk): boolean {
  if (
    chunk.bashCommand !== null ||
    run.lastChunk.bashCommand !== null ||
    record.timestamp === null ||
    record.timestamp !== run.last.timestamp
  ) {
    return false;
  }
  // A cut line lost its event id and index.
  if (record.isTruncated || run.last.isTruncated) return true;
  if (
    chunk.promptIndex !== run.lastChunk.promptIndex ||
    chunk.isHidden !== run.lastChunk.isHidden ||
    record.eventNumber === null ||
    run.last.eventNumber === null
  ) {
    return false;
  }
  return (
    record.eventNumber.prefix === run.last.eventNumber.prefix &&
    record.eventNumber.number === run.last.eventNumber.number + 1
  );
}

export const date = (milliseconds: number) => new Date(milliseconds).toISOString();

/** A notice whose detail is Grok's text, capped like a row's output; Copy gives the whole text. */
export function textNotice(kind: NoticeKind, title: string, text: string | null): ChatNotice {
  const detail = text === null ? null : capPreview(text).text;
  return makeNotice(kind, title, { detail, rawDetail: detail === text ? null : text });
}

/**
 * The notice a cancelled turn ends with. A rejected permission ends the turn too, and its declined
 * call says so.
 */
export function cancelNotice(category: string | null, trigger: string | null): ChatNotice | null {
  switch (category) {
    case 'PermissionRejected':
      return null;
    case 'PermissionCancelled':
      return makeNotice('stopped', 'Stopped at the permission prompt');
    // Grok 1.0.62 holds both spellings.
    case 'HookDenied':
    case 'HookStopped':
      return makeNotice('hook', 'A hook stopped the turn');
    case 'MidTurnAbort':
    case null:
      switch (trigger) {
        case 'send_now':
          return makeNotice('interrupted', 'Interrupted to send the next message');
        case 'shutdown':
          return makeNotice('stopped', 'Grok Build exited');
        default:
          return makeNotice('stopped', 'Stopped');
      }
    default:
      return makeNotice('stopped', 'Stopped');
  }
}

/**
 * What Grok shows for a prompt: a skill's or interjection's display text, else the text without
 * the context Grok adds to the first prompt of a fork or a resumed session.
 */
export function shownText(chunk: UserChunk): string {
  let text = chunk.displayText ?? chunk.text ?? '';
  // Grok's `strip_context_wrappers`: each wrapper's first occurrence, and the whitespace after it.
  for (const tag of ['fork-context', 'resume-context']) {
    const open = text.indexOf(`<${tag}>`);
    if (open < 0) continue;
    const afterOpen = open + tag.length + 2;
    const close = text.indexOf(`</${tag}>`, afterOpen);
    if (close < 0) continue;
    text = text.slice(0, open) + text.slice(close + tag.length + 3).replace(/^\s+/, '');
  }
  return text;
}

/** A skill's `/name arguments`. */
export function skill(displayText: string): ChatCommandInvocation | null {
  if (!displayText.startsWith('/')) return null;
  const name = /^\S*/.exec(displayText.slice(1))?.[0] ?? '';
  if (name === '') return null;
  return { name, arguments: displayText.slice(name.length + 1).trim() };
}

export const outputReference = (record: GrokUpdateRecord): ChatOutputReference => ({
  path: null,
  offset: record.offset,
  length: record.length,
});

export interface LastChunk {
  entry: number;
  isReasoning: boolean;
  chunkID: number;
  promptID: string | null;
}
