// The entries, turns and prompts Hermes Agent's rows make, built in slot order. A turn runs from a
// prompt to the next one: Hermes writes no row for a turn's end, so a run ends with a final answer,
// or when herdr no longer reports the Agent working. A tool result is its own row and fills in the
// call an assistant row made.

import { notice, userMessage } from '../model/factories';
import { capPreview } from '../model/preview';
import {
  type ChatEntryContent,
  type ChatProjectionContext,
  type ChatTranscript,
  emptyTranscript,
} from '../model/types';
import { compactionPreview, isCut, shown, trimmed } from '../store/text';
import type { HermesRow } from './record';
import { applyHermesResult, hermesToolActivity } from './tools';

const dateOf = (seconds: number | null): string | null =>
  seconds === null ? null : new Date(seconds * 1000).toISOString();

/** A final answer: Hermes is done with the turn, whatever herdr reports. */
const isAnswer = (row: HermesRow | null): boolean =>
  row?.role === 'assistant' && row.toolCalls.length === 0 && row.finishReason !== null;

export class HermesProjection {
  readonly transcript: ChatTranscript = emptyTranscript();
  /** Tool entries with no result yet, by call id; a call without an id never gets one. */
  private readonly waiting = new Map<string, number>();
  /** The run's turn, an index into the transcript's turns; null above the first prompt. */
  private turn: number | null = null;
  private lastRow: HermesRow | null = null;

  constructor(private readonly context: ChatProjectionContext) {
    this.transcript.needsOlderHistory = context.windowStart > 0;
  }

  add(row: HermesRow, length: number): void {
    switch (row.role) {
      case 'user':
        this.addUser(row);
        break;
      case 'assistant':
        this.addAssistant(row);
        break;
      case 'tool':
        this.addResult(row, length);
        break;
      default:
        (this.transcript.diagnostics.unknownRecordTypes as Set<string>).add(row.role);
        return;
    }
    this.lastRow = row;
  }

  /** Settles the last run, which goes on only while herdr reports the Agent at work on it. */
  finish(): void {
    const { activity } = this.context;
    const isRunning = activity === 'working' || activity === 'blocked';
    if (!isRunning || isAnswer(this.lastRow)) this.endRun();
  }

  private addUser(row: HermesRow): void {
    if (row.isSummary) {
      this.entry(row, 'divider', { kind: 'compaction', detail: compactionPreview(row.text) });
      return;
    }
    // What Hermes itself adds as a user message: a model switch, a finished background task.
    if (row.displayKind !== null) {
      const detail = capPreview(row.text).text;
      this.entry(row, 'notice', notice('system', 'Added by Hermes Agent', { detail }));
      return;
    }
    this.endRun();
    const id = this.entryID(row);
    this.transcript.turns.push({
      firstEntryID: id,
      startedAt: dateOf(row.timestamp),
      endedAt: null,
      ending: null,
    });
    this.turn = this.transcript.turns.length - 1;
    const text = shown(trimmed(row.text), isCut(row.text, row.length));
    this.entry(row, 'user', userMessage(text, { imageCount: row.imageCount }));
    const offset = Math.max(row.seq, 0);
    this.transcript.recordedPrompts.push({
      offset,
      text: row.text,
      entryID: id,
      // A prompt of only an image records no text to match a send.
      pastedImagePaths: trimmed(row.text) === '' && row.imageCount > 0 ? [] : null,
    });
    this.transcript.latestPromptOffset = offset;
  }

  private addAssistant(row: HermesRow): void {
    const reasoning = trimmed(row.reasoning ?? '');
    if (reasoning !== '') {
      this.entry(row, 'reasoning', { text: reasoning, durationMilliseconds: null }, ':reasoning');
    }
    if (trimmed(row.text) !== '') {
      const text = shown(row.text, isCut(row.text, row.length));
      this.entry(row, 'assistant', { text }, ':text');
    }
    row.toolCalls.forEach((call, index) => {
      if (call.id !== null) this.waiting.set(call.id, this.transcript.entries.length);
      this.entry(row, 'tool', hermesToolActivity(call), `:tool:${index}`);
    });
  }

  private addResult(row: HermesRow, length: number): void {
    const at = row.toolCallID === null ? undefined : this.waiting.get(row.toolCallID);
    const target = at === undefined ? undefined : this.transcript.entries[at];
    if (target?.content.type === 'tool') {
      this.waiting.delete(row.toolCallID ?? '');
      applyHermesResult(target.content.value, row, length);
      return;
    }
    // Its call sits above the window.
    const name = row.toolName ?? 'tool';
    const tool = hermesToolActivity({ id: row.toolCallID, name, arguments: '' });
    applyHermesResult(tool, row, length);
    this.entry(row, 'tool', tool);
  }

  /** Ends the turn, and the calls that never got a result with it. */
  private endRun(): void {
    const turn = this.turn === null ? undefined : this.transcript.turns[this.turn];
    if (turn) {
      turn.ending = isAnswer(this.lastRow) ? 'completed' : 'interrupted';
      turn.endedAt = dateOf(this.lastRow?.timestamp ?? null);
    }
    this.turn = null;
    for (const entry of this.transcript.entries) {
      if (entry.content.type === 'tool' && entry.content.value.status === 'running') {
        entry.content.value.status = 'notCompleted';
      }
    }
    this.waiting.clear();
  }

  private entryID(row: HermesRow, suffix = ''): string {
    return `hermes:${row.seq}${suffix}`;
  }

  private entry<T extends ChatEntryContent['type']>(
    row: HermesRow,
    type: T,
    value: Extract<ChatEntryContent, { type: T }>['value'],
    suffix = '',
  ): void {
    this.transcript.entries.push({
      id: this.entryID(row, suffix),
      sourceOffset: Math.max(row.seq, 0),
      content: { type, value } as ChatEntryContent,
    });
  }
}
