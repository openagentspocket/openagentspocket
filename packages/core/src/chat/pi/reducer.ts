// The Pi and Oh My Pi transcript reducer (Swift PiTranscriptReducer): turns a session file's tree of
// records into Chat entries. It keeps one decoded record per line and rebuilds the timeline from
// them, so a window never holds tool output in memory.

import { decodeUtf8 } from '../../events/utf8';
import { type ChatLine, isTruncatedLine } from '../model/lines';
import { allAddedChange, emptyFileChanges } from '../model/preview';
import type { ChatToolOutput, ChatTranscriptReducer } from '../model/reducer';
import { asBool, asObject, asString } from '../model/reducer';
import type {
  ChatProgram,
  ChatProjectionContext,
  ChatToolActivity,
  ChatTranscript,
} from '../model/types';
import { piFileChanges } from './file-changes';
import { projectPiTranscript } from './projection';
import { decodePiLine, type PiRecord } from './record';
import { blocks, resultPreview } from './tools';

/** Bumped when the normalization changes, so entries cached by an older build are dropped. */
export const PI_REVISION = 10;

export class PiTranscriptReducer implements ChatTranscriptReducer {
  private readonly records = new Map<number, PiRecord>();
  private readonly invalid = new Set<number>();
  private readonly oversized = new Set<number>();
  /** Oh My Pi flags every message that steered a running turn; only Pi's are told apart by when they were written. */
  private readonly flagsSteers: boolean;

  constructor(program: Extract<ChatProgram, 'pi' | 'omp'> = 'pi') {
    this.flagsSteers = program === 'omp';
  }

  append(lines: readonly ChatLine[]): void {
    for (const line of lines) {
      if (isTruncatedLine(line)) this.oversized.add(line.offset);
      const record = decodePiLine(line);
      if (record) this.records.set(line.offset, record);
      else this.invalid.add(line.offset);
    }
  }

  prepend(lines: readonly ChatLine[]): void {
    this.append(lines);
  }

  get unsupportedFormat(): string | null {
    for (const record of this.records.values()) {
      if (record.type !== 'session') continue;
      const version = record.value.version;
      if (version !== 2 && version !== 3) return 'Pi session without a supported v2/v3 tree';
    }
    return null;
  }

  transcript(context: ChatProjectionContext): ChatTranscript {
    return projectPiTranscript([...this.records.values()], context, this.flagsSteers, {
      invalid: this.invalid.size,
      oversized: this.oversized.size,
    });
  }

  output(line: ChatLine, tool: ChatToolActivity): ChatToolOutput | null {
    if (isTruncatedLine(line)) return null;
    let record: unknown;
    try {
      record = JSON.parse(decodeUtf8(line.data));
    } catch {
      return null;
    }
    const object = asObject(record);
    const message = asObject(object?.message);
    if (asString(object?.type) !== 'message' || !message) return null;
    const role = asString(message.role);
    // A write's row reads its text from the call.
    if (role === 'assistant') {
      const file = tool.fileChanges?.files[0];
      if (file?.kind !== 'written') return null;
      const call = blocks(message.content)
        .map(asObject)
        .find(
          (block) => asString(block?.type) === 'toolCall' && asString(block?.id) === tool.callID,
        );
      const content = asString(asObject(call?.arguments)?.content);
      if (content === null) return null;
      const changes = emptyFileChanges(tool.fileChanges?.directory ?? null);
      changes.files = [allAddedChange(file.path, content, 'written')];
      return { type: 'preview', preview: null, fileChanges: changes };
    }
    if (role !== 'toolResult' || asString(message.toolCallId) !== tool.callID) return null;
    // Pi's path came from the call, which the row's changes kept.
    const fileChanges =
      asBool(message.isError) === true
        ? null
        : piFileChanges(
            message.details,
            tool.fileChanges?.files[0]?.path ?? null,
            tool.fileChanges?.directory ?? null,
          );
    return { type: 'preview', preview: resultPreview(message), fileChanges };
  }
}
