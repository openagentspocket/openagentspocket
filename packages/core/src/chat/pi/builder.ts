// What the Pi projection accumulates while it replays a branch (Swift PiTranscriptReducer.transcript's
// local state): the transcript being built, the calls seen so far and what the last records said.

import { notice } from '../model/factories';
import { asBool, asString, type JsonObject } from '../model/reducer';
import type {
  ChatEntryContent,
  ChatProjectionContext,
  ChatTranscript,
  TurnEnding,
} from '../model/types';
import { type PiRecord, writtenAt } from './record';
import { textOf } from './tools';

export class PiBuilder {
  /** Where each call's row sits among the entries. */
  readonly calls = new Map<string, number>();
  /** The path each call names in its arguments, which Pi's edit result leaves out. */
  readonly callPaths = new Map<string, string>();
  /** The `local://` files a free-form edit's patch names, by call id. */
  readonly localPatchPaths = new Map<string, string[]>();
  /** The text each write call names, which its result leaves out, and the call's line. */
  readonly writes = new Map<string, { content: string; offset: number; length: number }>();
  /** Calls that show no row, and whose results show none. */
  readonly hiddenCalls = new Set<string>();
  // The last assistant's stop reason says whether the branch's latest turn ended, whatever opened it.
  lastStopReason: string | null = null;
  // The latest tool result's text, until the next assistant message.
  lastToolResultText: string | null = null;
  // When the latest tool result was written, while it is the last message: a prompt Pi writes right
  // after it is one it delivered while the turn ran.
  toolResultWrittenAt: number | null = null;

  constructor(
    readonly transcript: ChatTranscript,
    readonly context: ChatProjectionContext,
    readonly directory: string | null,
    readonly flagsSteers: boolean,
  ) {}

  entryID(record: PiRecord, suffix = ''): string {
    return `pi:${record.id ?? String(record.offset)}${suffix}`;
  }

  add(record: PiRecord, content: ChatEntryContent, suffix = ''): void {
    this.transcript.entries.push({
      id: this.entryID(record, suffix),
      sourceOffset: record.offset,
      content,
    });
  }

  finish(ending: TurnEnding, record: PiRecord): void {
    const endedAt = writtenAt(record)?.iso ?? null;
    const last = this.transcript.turns[this.transcript.turns.length - 1];
    if (last) {
      last.ending = ending;
      last.endedAt = endedAt;
    } else {
      this.transcript.precedingTurnEnd = { ending, endedAt, duration: null };
    }
  }

  /** A prompt the user sent: it closes a turn still open and opens its own. */
  openTurn(record: PiRecord, content: ChatEntryContent, prompt: string): void {
    const { transcript } = this;
    const last = transcript.turns[transcript.turns.length - 1];
    if (last && last.ending === null) {
      last.ending = 'interrupted';
      last.endedAt = writtenAt(record)?.iso ?? null;
    }
    this.add(record, content);
    const id = this.entryID(record);
    transcript.turns.push({
      firstEntryID: id,
      startedAt: writtenAt(record)?.iso ?? null,
      endedAt: null,
      ending: null,
    });
    this.recordPrompt(record, prompt);
    transcript.latestPromptOffset = record.offset;
  }

  /** A prompt that steered the running turn: it stays in that turn, and its tools keep running. */
  joinTurn(record: PiRecord, content: ChatEntryContent, prompt: string): void {
    this.add(record, content);
    this.recordPrompt(record, prompt);
  }

  private recordPrompt(record: PiRecord, prompt: string): void {
    if (record.isTruncated) return;
    this.transcript.recordedPrompts.push({
      offset: record.offset,
      text: prompt,
      entryID: this.entryID(record),
      pastedImagePaths: null,
    });
  }

  customNotice(record: PiRecord, value: JsonObject): void {
    if (asBool(value.display) !== true) return;
    this.add(record, {
      type: 'notice',
      value: notice('hook', asString(value.customType) ?? 'Extension', {
        detail: textOf(value.content),
      }),
    });
  }
}
