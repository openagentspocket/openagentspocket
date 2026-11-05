// The projection of Grok Build's update records into Chat entries (the Projection of Swift
// GrokTranscriptReducer): one pass over the records a rewind did not hide.

import { divider, notice as makeNotice } from '../model/factories';
import type { ChatEntryContent, ChatTranscript, TurnEnding } from '../model/types';
import {
  cancelNotice,
  date,
  isContinued,
  type LastChunk,
  type OpenTurn,
  outputReference,
  runContent,
  shownText,
  skill,
  startMs,
  textNotice,
  type UserRun,
} from './projection-support';
import { ToolProjection } from './tool-projection';
import type {
  AgentChunk,
  GrokUpdateRecord,
  Retry,
  SubagentFinished,
  TurnCompleted,
  UserChunk,
} from './update-record';

export class Projection extends ToolProjection {
  /** Records before the first counted prompt belong to a turn opened above the loaded lines. */
  private sawCountedPrompt = false;
  private run: UserRun | null = null;
  /** The entry the previous record's message or thought placed, which the next part of the same block extends. */
  private lastChunk: LastChunk | null = null;

  read(record: GrokUpdateRecord): void {
    // A prompt's chunks, and a block's parts, are consecutive records.
    const { kind } = record;
    if (kind.type === 'userChunk') this.lastChunk = null;
    else if (kind.type === 'agentMessage' || kind.type === 'agentThought') this.run = null;
    else {
      this.run = null;
      this.lastChunk = null;
    }
    switch (kind.type) {
      case 'userChunk':
        this.readPrompt(record, kind.chunk);
        break;
      case 'agentMessage':
        this.readChunk(record, kind.chunk, false);
        break;
      case 'agentThought':
        this.readChunk(record, kind.chunk, true);
        break;
      case 'toolCall':
        this.noteOutput(record);
        if (kind.tool) this.readTool(record, kind.tool, true);
        break;
      case 'toolUpdate':
        this.noteOutput(record);
        if (kind.tool) this.readTool(record, kind.tool, false);
        break;
      case 'taskBackgrounded': {
        const call = kind.task.callID === null ? undefined : this.calls.get(kind.task.callID);
        if (call && kind.task.callID !== null) {
          if (kind.task.taskID !== null) this.taskCalls.set(kind.task.taskID, kind.task.callID);
          call.sentToBackground = true;
        }
        break;
      }
      case 'taskCompleted':
        this.readTaskEnd(record, kind.end);
        break;
      case 'subagentSpawned':
        this.readSpawn(kind.spawned);
        break;
      case 'subagentFinished': {
        const callID =
          kind.finished.subagentID === null
            ? undefined
            : this.subagentCalls.get(kind.finished.subagentID);
        const call = callID === undefined ? undefined : this.calls.get(callID);
        if (call) {
          call.subagentEnd = kind.finished satisfies SubagentFinished;
          call.subagentEndLine = outputReference(record);
        }
        break;
      }
      case 'turnCompleted':
        this.readEnd(record, kind.end);
        break;
      case 'compactionCheckpoint':
        // `summary_preview` is always null.
        this.place(
          { type: 'divider', value: divider('compaction') },
          `grok:${record.offset}:compaction`,
          record.offset,
        );
        break;
      case 'compactionCancelled':
        this.addNotice(makeNotice('system', 'Compaction was cancelled'), record);
        break;
      case 'compactionFailed':
        this.addNotice(textNotice('system', 'Compaction failed', kind.error), record);
        break;
      case 'retry':
        this.readRetry(record, kind.retry);
        break;
      case 'imageDropped':
        // Grok drops an image that fails its checks before sending.
        this.addNotice(
          makeNotice('system', kind.notes.length > 1 ? 'Images not sent' : 'Image not sent', {
            detail: kind.notes.length === 0 ? null : kind.notes.join('\n'),
          }),
          record,
        );
        break;
      case 'rewind':
      case 'skipped':
        break;
      case 'unknown':
        this.unknownTypes.add(kind.name);
        break;
    }
  }

  finish(): ChatTranscript {
    this.resolveTools();
    // Ctrl+C before the first output takes the prompt out of Grok's conversation and puts its text
    // back in the input box; Grok writes no end for the turn. Working, the reply may still come.
    const open = this.open;
    if (
      open &&
      this.activity === 'idle' &&
      !open.hasOutput &&
      open.opener !== null &&
      open.turn !== null
    ) {
      const turn = this.transcript.turns[open.turn];
      if (turn) turn.ending = 'interrupted';
      this.transcript.entries.push({
        id: `${open.opener}:notice`,
        sourceOffset: open.openerOffset,
        content: {
          type: 'notice',
          value: makeNotice('stopped', 'Stopped before a reply', {
            detail: 'Grok Build put the message back in its input box.',
          }),
        },
      });
    }
    this.transcript.diagnostics = {
      ...this.transcript.diagnostics,
      unknownRecordTypes: this.unknownTypes,
    };
    return this.transcript;
  }

  // MARK: Prompts

  private readPrompt(record: GrokUpdateRecord, chunk: UserChunk): void {
    if (this.run && isContinued(this.run, record, chunk)) {
      this.run.last = record;
      this.run.lastChunk = chunk;
      this.add(record, chunk, this.run);
      return;
    }
    this.run = null;
    if (chunk.bashCommand !== null) {
      // `!cmd` typed in Grok runs the command without the model.
      this.addNotice(makeNotice('shellCommand', chunk.bashCommand), record);
      return;
    }
    // A cut line lost the prompt's index: it is most likely a prompt of its own, too long for the
    // reader, such as a large image.
    const isCounted = chunk.promptIndex !== null || record.isTruncated;
    if (isCounted) {
      this.sawCountedPrompt = true;
      const open = this.open;
      if (open) {
        if (
          !chunk.isHidden &&
          !open.hasOutput &&
          chunk.promptIndex !== null &&
          chunk.promptIndex === open.promptIndex
        ) {
          // The prompt Ctrl+C put back in the input box, sent again with whatever was typed after it.
          this.takeOver(open);
        } else if (open.turn !== null) {
          // Grok crashed or was killed during the turn.
          const turn = this.transcript.turns[open.turn];
          if (turn) turn.ending = 'interrupted';
        }
      }
      this.endTurn('replaced');
      this.turnEnds.push(null);
      this.open = {
        promptIndex: chunk.promptIndex,
        openerOffset: record.offset,
        opener: null,
        turn: null,
        promptMilliseconds: record.agentTimestampMs,
        promptSeconds: record.timestamp,
        firstTurnStartMs: null,
        hasOutput: false,
      };
    }
    const run: UserRun = {
      last: record,
      lastChunk: chunk,
      offset: record.offset,
      isHidden: chunk.isHidden,
      opensTurn: isCounted,
      command: chunk.displayAsSkill && chunk.displayText !== null ? skill(chunk.displayText) : null,
      wasQueued: !isCounted,
      text: '',
      images: 0,
      lostText: false,
      entry: null,
    };
    if (!chunk.isHidden) this.transcript.latestPromptOffset = record.offset;
    this.add(record, chunk, run);
    this.run = run;
  }

  /** Adds one chunk to its prompt's entry, placing the entry once it has something to show, and keeps the recorded prompt in step. */
  private add(record: GrokUpdateRecord, chunk: UserChunk, run: UserRun): void {
    if (run.isHidden) return;
    const text = shownText(chunk);
    if (text !== '') run.text = run.text === '' ? text : `${run.text}\n${text}`;
    if (chunk.contentType === 'image') run.images += 1;
    else if (record.isTruncated) run.lostText = true;
    const content = runContent(run);
    if (content === null) return;
    const id = `grok:${run.offset}`;
    if (run.entry !== null) {
      const entry = this.transcript.entries[run.entry];
      if (entry) entry.content = content;
    } else {
      run.entry = this.place(content, id, run.offset);
      if (run.opensTurn && this.open) this.open.opener = id;
    }
    const prompts = this.transcript.recordedPrompts;
    if (prompts[prompts.length - 1]?.entryID === id) prompts.pop();
    if (!run.lostText && run.text !== '') {
      prompts.push({ offset: run.offset, text: run.text, entryID: id, pastedImagePaths: null });
    }
  }

  /** Drops the open turn's prompt for the one that takes it over. */
  private takeOver(open: OpenTurn): void {
    if (open.opener !== null) {
      const opener = open.opener;
      this.transcript.entries = this.transcript.entries.filter((entry) => entry.id !== opener);
      this.transcript.recordedPrompts = this.transcript.recordedPrompts.filter(
        (prompt) => prompt.entryID !== opener,
      );
    }
    if (open.turn !== null) this.transcript.turns.splice(open.turn, 1);
  }

  // MARK: Agent records

  private readChunk(record: GrokUpdateRecord, chunk: AgentChunk, isReasoning: boolean): void {
    this.noteOutput(record);
    const text = chunk.text ?? '';
    const last = this.lastChunk;
    if (
      last &&
      last.isReasoning === isReasoning &&
      last.promptID === record.promptID &&
      chunk.chunkID !== null &&
      chunk.chunkID === last.chunkID + 1
    ) {
      // The next part of the same block.
      const entry = this.transcript.entries[last.entry];
      if (entry?.content.type === 'assistant') {
        entry.content = { type: 'assistant', value: { text: entry.content.value.text + text } };
      } else if (entry?.content.type === 'reasoning') {
        entry.content = {
          type: 'reasoning',
          value: { ...entry.content.value, text: entry.content.value.text + text },
        };
      }
      last.chunkID = chunk.chunkID;
      return;
    }
    if (text === '') {
      this.lastChunk = null;
      return;
    }
    const content: ChatEntryContent = isReasoning
      ? { type: 'reasoning', value: { text, durationMilliseconds: null } }
      : { type: 'assistant', value: { text } };
    const entry = this.place(content, `grok:${record.offset}`, record.offset);
    this.lastChunk =
      chunk.chunkID === null
        ? null
        : { entry, isReasoning, chunkID: chunk.chunkID, promptID: record.promptID };
  }

  /** A message, thought or tool record: the open turn has output. */
  private noteOutput(record: GrokUpdateRecord): void {
    const open = this.open;
    if (!open) return;
    open.hasOutput = true;
    if (
      open.promptMilliseconds === null &&
      open.firstTurnStartMs === null &&
      record.turnStartMs !== null
    ) {
      open.firstTurnStartMs = record.turnStartMs;
      if (open.turn !== null) {
        const turn = this.transcript.turns[open.turn];
        if (turn) turn.startedAt = date(record.turnStartMs);
      }
    }
  }

  private readEnd(record: GrokUpdateRecord, end: TurnCompleted): void {
    let ending: TurnEnding;
    switch (end.stopReason) {
      case 'end_turn':
        ending = 'completed';
        break;
      case 'cancelled': {
        ending = 'interrupted';
        const cancelled = cancelNotice(end.cancellationCategory, end.cancelTrigger);
        if (cancelled) this.addNotice(cancelled, record);
        break;
      }
      case 'error':
        ending = 'failed';
        this.addNotice(
          textNotice('error', 'Grok Build stopped with an error', end.agentResult),
          record,
        );
        break;
      default:
        ending = 'completed';
        this.unknownTypes.add(`stop_reason:${end.stopReason ?? 'none'}`);
    }
    const open = this.open;
    if (open) {
      // Records after the end stay in this turn's range.
      if (open.turn !== null) {
        const start = startMs(open);
        const endMs =
          record.agentTimestampMs ??
          (end.elapsedMilliseconds !== null && start !== null
            ? start + end.elapsedMilliseconds
            : null);
        const turn = this.transcript.turns[open.turn];
        if (turn) {
          turn.ending = ending;
          turn.endedAt = endMs === null ? null : date(endMs);
        }
      }
      this.open = null;
    } else if (!this.sawCountedPrompt && this.transcript.precedingTurnEnd === null) {
      this.transcript.precedingTurnEnd = {
        ending,
        endedAt: record.agentTimestampMs === null ? null : date(record.agentTimestampMs),
        duration: end.elapsedMilliseconds === null ? null : end.elapsedMilliseconds / 1000,
      };
    }
    switch (end.stopReason) {
      case 'cancelled':
        this.endTurn(end.cancellationCategory === 'PermissionRejected' ? 'rejected' : 'cancelled');
        break;
      case 'error':
        this.endTurn('failed');
        break;
      default:
        this.endTurn('completed');
    }
  }

  private readRetry(record: GrokUpdateRecord, retry: Retry): void {
    if (retry.kind === 'exhausted') {
      const title =
        retry.attempts === null
          ? 'Grok Build gave up'
          : `Grok Build gave up after ${retry.attempts} attempts`;
      this.addNotice(textNotice('error', title, retry.reason), record);
    } else if (retry.kind === 'failed') {
      this.addNotice(textNotice('error', 'Grok Build gave up', retry.message), record);
    }
  }
}
