// OpenCode keeps a session as rows in its own database, which the record source reads by query
// (ADR 0025). Rows order by `seq`, never by time. OpenCode rewrites its newest step in place, so the
// reducer holds rows by id and a newer read of a row replaces its entries. A committed `/undo`
// deletes rows, after which the source starts a fresh reducer (Swift OpenCodeTranscriptReducer).

import { notice } from '../model/factories';
import { type ChatLine, isTruncatedLine } from '../model/lines';
import type { ChatToolOutput, ChatTranscriptReducer } from '../model/reducer';
import type { ChatProjectionContext, ChatToolActivity, ChatTranscript } from '../model/types';
import { OpenCodeProjection } from './projection';
import { offsetOf } from './projection-parts';
import {
  majorVersion,
  type OpenCodeInbox,
  type OpenCodeRow,
  type OpenCodeSession,
  readOpenCodeLine,
} from './record';
import { openCodeToolOutput } from './tool-summary';

export const OPENCODE_REVISION = 1;

/** OpenCode's timestamped placeholder titles say nothing. */
const PLACEHOLDER_TITLE = /^(New|Child) session - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function titleOf(title: string | null | undefined): string | null {
  if (!title || PLACEHOLDER_TITLE.test(title)) return null;
  return title;
}

interface Held {
  row: OpenCodeRow;
  /** The line's length, which an expanded tool row reads again. */
  length: number;
}

export class OpenCodeTranscriptReducer implements ChatTranscriptReducer {
  private readonly rows = new Map<string, Held>();
  private session: OpenCodeSession | null = null;
  private inbox: OpenCodeInbox | null = null;
  /** Lines that are none of the three kinds, by offset. */
  private readonly malformed = new Set<number>();
  /** Lines that arrived cut short, by offset. */
  private readonly cut = new Set<number>();

  append(lines: readonly ChatLine[]): void {
    this.read(lines, true);
  }

  prepend(lines: readonly ChatLine[]): void {
    this.read(lines, false);
  }

  /** An older page never replaces what a newer read gave. */
  private read(lines: readonly ChatLine[], isNewer: boolean): void {
    for (const line of lines) {
      if (isTruncatedLine(line)) {
        this.cut.add(line.offset);
        continue;
      }
      const parsed = readOpenCodeLine(line.data);
      switch (parsed.kind) {
        case 'session':
          if (isNewer || this.session === null) this.session = parsed.session;
          break;
        case 'inbox':
          if (isNewer || this.inbox === null) this.inbox = parsed.inbox;
          break;
        case 'row':
          if (isNewer || !this.rows.has(parsed.row.id)) {
            this.rows.set(parsed.row.id, { row: parsed.row, length: line.length });
          }
          break;
        case 'malformed':
          this.malformed.add(line.offset);
          break;
      }
    }
  }

  get unsupportedFormat(): string | null {
    const major = majorVersion(this.session);
    if (this.session?.version == null || major === null || major <= 2) return null;
    return `OpenCode session version ${this.session.version}`;
  }

  transcript(context: ChatProjectionContext): ChatTranscript {
    const major = majorVersion(this.session);
    const projection = new OpenCodeProjection(context, major !== null && major < 2);
    const { transcript } = projection;
    transcript.title = titleOf(this.session?.title);
    transcript.diagnostics = this.diagnostics();
    // A staged `/undo` hides its rows, as OpenCode's own screen does: the next prompt deletes them.
    const message = this.session?.revertMessage ?? null;
    const boundary =
      message === null
        ? null
        : (this.session?.revertSeq ?? this.rows.get(message)?.row.seq ?? null);
    const ordered = [...this.rows.values()].sort((a, b) => a.row.seq - b.row.seq);
    for (const held of ordered) {
      if (boundary === null || held.row.seq < boundary) projection.add(held.row, held.length);
    }
    projection.finish();
    if (boundary !== null && message !== null) {
      projection.append({
        id: `oc:revert:${message}`,
        sourceOffset: offsetOf(boundary),
        content: {
          type: 'notice',
          value: notice('system', 'Undone in the terminal', {
            detail: 'The next message removes these messages; /redo brings them back.',
          }),
        },
      });
    }
    // Prompts OpenCode holds until the running step ends keep the id their rows will carry.
    for (const item of this.inbox?.items ?? []) {
      if (item.type !== 'user' || item.id === null || this.rows.has(item.id)) continue;
      projection.addQueued(item, `oc:${item.id}`);
    }
    return transcript;
  }

  output(line: ChatLine, tool: ChatToolActivity): ChatToolOutput | null {
    if (isTruncatedLine(line) || tool.callID === null) return null;
    const parsed = readOpenCodeLine(line.data);
    if (parsed.kind !== 'row' || parsed.row.content.type !== 'assistant') return null;
    for (const item of parsed.row.content.step.items) {
      if (item.kind.type === 'tool' && item.kind.tool.callID === tool.callID) {
        return openCodeToolOutput(item.kind.tool);
      }
    }
    return null;
  }

  private diagnostics(): ChatTranscript['diagnostics'] {
    let invalidLines = this.malformed.size;
    let oversizedLines = this.cut.size;
    const unknownRecordTypes = new Set<string>();
    for (const { row } of this.rows.values()) {
      if (row.content.type === 'invalid') invalidLines += 1;
      else if (row.content.type === 'oversized') oversizedLines += 1;
      else if (row.content.type === 'unknown') unknownRecordTypes.add(row.type);
    }
    return { invalidLines, oversizedLines, unknownRecordTypes };
  }
}
