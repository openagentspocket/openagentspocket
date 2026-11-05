// A tool result on the branch (Swift PiTranscriptReducer, `message` role `toolResult`): it settles
// its call's row with a status, answers, file changes and a preview.

import { allAddedChange, emptyFileChanges } from '../model/preview';
import { asBool, asObject, asString, type JsonObject } from '../model/reducer';
import type { ChatEntry, ChatToolActivity } from '../model/types';
import type { PiBuilder } from './builder';
import { piFileChanges } from './file-changes';
import { type PiRecord, writtenAt } from './record';
import {
  ABORTED_RESULTS,
  ASK_CANCELLED,
  DENIED_PREFIX,
  PLAN_DEVICE,
  recordAnswers,
  resultPreview,
  showChanges,
  textOf,
  toolRow,
} from './tools';

export function toolResultRow(b: PiBuilder, record: PiRecord, message: JsonObject): void {
  const callID = asString(message.toolCallId);
  if (callID === null) return;
  const resultText = textOf(message.content).trim();
  b.lastToolResultText = resultText;
  b.toolResultWrittenAt = writtenAt(record)?.ms ?? null;
  // A device's result names it in `details.xdev`, which tells a plan hand-off whose call is
  // above the lines read.
  const device = asString(asObject(asObject(asObject(message.details)?.xdev))?.tool);
  const index = b.calls.get(callID);
  if (b.hiddenCalls.has(callID) || (index === undefined && device === PLAN_DEVICE)) return;
  const existing = index === undefined ? undefined : b.transcript.entries[index]?.content;
  const tool: ChatToolActivity =
    existing?.type === 'tool'
      ? existing.value
      : toolRow(
          device ?? asString(message.toolName) ?? 'Tool',
          null,
          callID,
          b.context.activity,
          b.directory,
        );
  // The write call whose text the row shows as its output.
  let writtenBy: { offset: number; length: number } | null = null;
  if (asBool(message.isError) === true) {
    tool.status =
      resultText.startsWith(DENIED_PREFIX) || resultText === ASK_CANCELLED
        ? 'declined'
        : ABORTED_RESULTS.has(resultText)
          ? 'interrupted'
          : 'failed';
  } else {
    tool.status = 'succeeded';
    recordAnswers(message.details, tool.questions);
    const callPath = b.callPaths.get(callID) ?? null;
    const changes = piFileChanges(message.details, callPath, b.directory);
    const write = b.writes.get(callID);
    if (changes) {
      showChanges(changes, tool, callPath !== null, b.localPatchPaths.get(callID) ?? []);
    } else if (callPath !== null && callPath !== '' && write && write.content !== '') {
      // A write records no diff and says nothing of what the file held before: its text, all added.
      const file = allAddedChange(callPath, write.content, 'written');
      const shown = emptyFileChanges(b.directory);
      shown.files = [file];
      showChanges(shown, tool, true);
      writtenBy = write;
    }
  }
  tool.preview = resultPreview(message);
  if (record.isTruncated) {
    tool.preview.isTruncated = true;
    tool.note = 'Output exceeds the preview limit.';
  }
  tool.output = {
    path: null,
    offset: (writtenBy ?? record).offset,
    length: (writtenBy ?? record).length,
  };
  if (index !== undefined) {
    const entry = b.transcript.entries[index] as ChatEntry;
    entry.content = { type: 'tool', value: tool };
  } else {
    b.calls.set(callID, b.transcript.entries.length);
    b.transcript.entries.push({
      id: `pi:tool:${callID}`,
      sourceOffset: record.offset,
      content: { type: 'tool', value: tool },
    });
  }
}
