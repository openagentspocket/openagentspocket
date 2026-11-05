// Reads a Grok Build session's `updates.jsonl`, which Grok appends one ACP update per line as the
// session runs (Swift GrokTranscriptReducer).
//
// Every pass projects all the loaded records again, as Pi's reducer does: a `rewind_marker` hides
// turns above it, and a prompt Grok put back in its input box is taken over by the next one, so no
// entry is final when its line is read. Entry ids come from byte offsets, never from `eventId`,
// which Grok numbers again after a rewind.

import { type ChatLine, isTruncatedLine } from '../model/lines';
import { isAbsoluteHostPath } from '../model/paths';
import type { ChatToolOutput, ChatTranscriptReducer } from '../model/reducer';
import type { ChatProjectionContext, ChatToolActivity, ChatTranscript } from '../model/types';
import { groupDirectoryOfTranscript } from './locator-paths';
import { Projection } from './projection';
import { shownChanges } from './tool-summary';
import { decodeUpdateRecord, type GrokUpdateRecord } from './update-record';

/** Bumped when the normalization changes, so entries cached by an older build are dropped. */
export const GROK_REVISION = 8;

/**
 * What a sent prompt and a recorded one are compared on. Grok records the space Chat adds after a
 * prompt, and a paste's line ends as typed.
 */
export function grokEchoKey(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^\s+|\s+$/g, '');
}

/**
 * The directory a session's group names: the directory percent-encoded. A long directory's group
 * is a slug, which names none.
 */
export function directoryOfTranscript(path: string): string | null {
  const group = groupDirectoryOfTranscript(path);
  const name = group
    .split('/')
    .filter((part) => part !== '')
    .pop();
  if (name === undefined) return null;
  let directory: string;
  try {
    directory = decodeURIComponent(name);
  } catch {
    return null;
  }
  return isAbsoluteHostPath(directory) ? directory : null;
}

/**
 * The positions in `ordered` that rewinds hide. A `rewind_marker` hides everything from the first
 * prompt before it whose index is at or above its target, up to the marker. Prompt indexes count
 * from the file's head, so the rule holds in a window that starts later; when the window's first
 * prompt comes after the target, or it has none, the target's prompt is above the window, and the
 * marker hides the window up to it.
 */
function rewound(ordered: readonly GrokUpdateRecord[], windowStart: number): Set<number> {
  const hidden = new Set<number>();
  ordered.forEach((record, marker) => {
    if (record.kind.type !== 'rewind' || record.kind.targetPromptIndex === null) return;
    const target = record.kind.targetPromptIndex;
    let first: number | null = null;
    let from: number | null = null;
    for (let index = 0; index < marker; index += 1) {
      if (hidden.has(index)) continue;
      const kind = ordered[index]?.kind;
      if (kind?.type !== 'userChunk' || kind.chunk.promptIndex === null) continue;
      const promptIndex = kind.chunk.promptIndex;
      if (first === null) first = promptIndex;
      if (promptIndex >= target) {
        from = index;
        break;
      }
    }
    if (windowStart > 0 && (first === null || first > target)) from = 0;
    if (from !== null) for (let index = from; index < marker; index += 1) hidden.add(index);
  });
  return hidden;
}

export class GrokTranscriptReducer implements ChatTranscriptReducer {
  /** The directory the session started in, which paths read relative to. */
  readonly directory: string | null;
  readonly unsupportedFormat: string | null = null;
  private readonly records = new Map<number, GrokUpdateRecord>();
  private readonly invalid = new Set<number>();
  private readonly oversized = new Set<number>();

  /** `transcriptPath` is the session's file on the Host. */
  constructor(readonly transcriptPath: string) {
    this.directory = directoryOfTranscript(transcriptPath);
  }

  append(lines: readonly ChatLine[]): void {
    for (const line of lines) {
      if (isTruncatedLine(line)) this.oversized.add(line.offset);
      const record = decodeUpdateRecord(line);
      if (record === null) {
        this.invalid.add(line.offset);
        continue;
      }
      this.records.set(line.offset, record);
    }
  }

  prepend(lines: readonly ChatLine[]): void {
    this.append(lines);
  }

  transcript(context: ChatProjectionContext): ChatTranscript {
    const ordered = [...this.records.values()].sort((a, b) => a.offset - b.offset);
    const hidden = rewound(ordered, context.windowStart);
    const projection = new Projection(context.activity, this.directory);
    ordered.forEach((record, index) => {
      if (!hidden.has(index)) projection.read(record);
    });
    const transcript = projection.finish();
    transcript.needsOlderHistory = context.windowStart > 0;
    transcript.diagnostics = {
      ...transcript.diagnostics,
      invalidLines: this.invalid.size,
      oversizedLines: this.oversized.size,
    };
    return transcript;
  }

  output(line: ChatLine, tool: ChatToolActivity): ChatToolOutput | null {
    if (isTruncatedLine(line)) return null;
    const record = decodeUpdateRecord(line);
    if (record === null) return null;
    const { kind } = record;
    if (kind.type === 'toolUpdate' && kind.tool && kind.tool.callID === tool.callID) {
      const { output, fileChanges } = kind.tool;
      if (output === null) return null;
      // A row that shows a diff reads its changes, not the result's text.
      if (tool.fileChanges !== null && fileChanges !== null) {
        return {
          type: 'preview',
          preview: null,
          fileChanges: shownChanges(fileChanges, tool.kind, tool.fileChanges.directory),
        };
      }
      return { type: 'preview', preview: output.preview, fileChanges: null };
    }
    // A background command's or monitor's row points at its task's end.
    if (kind.type === 'taskCompleted') {
      return { type: 'preview', preview: kind.end.preview, fileChanges: null };
    }
    if (kind.type === 'subagentFinished' && tool.kind === 'agent') {
      return { type: 'preview', preview: kind.finished.preview, fileChanges: null };
    }
    return null;
  }
}
