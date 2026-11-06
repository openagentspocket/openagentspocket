// Hermes Agent keeps a conversation as rows of its own database, which the record source reads by
// query (ADR 0025). Rows order by display slot, and a newer read of a slot replaces it.

import { type ChatLine, isTruncatedLine } from '../model/lines';
import type { ChatToolOutput, ChatTranscriptReducer } from '../model/reducer';
import type { ChatProjectionContext, ChatToolActivity, ChatTranscript } from '../model/types';
import { HermesProjection } from './projection';
import { type HermesRow, type HermesSession, readHermesLine } from './record';
import { hermesToolOutput } from './tools';

export const HERMES_REVISION = 1;

interface Held {
  row: HermesRow;
  /** The line's length, which an expanded tool row reads again. */
  length: number;
}

export class HermesTranscriptReducer implements ChatTranscriptReducer {
  private readonly rows = new Map<number, Held>();
  private session: HermesSession | null = null;
  /** Lines that are neither kind, by offset. */
  private readonly malformed = new Set<number>();
  /** Lines that arrived cut short, by offset. */
  private readonly cut = new Set<number>();

  readonly unsupportedFormat = null;

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
      const parsed = readHermesLine(line.data);
      if (parsed.kind === 'malformed') {
        this.malformed.add(line.offset);
      } else if (parsed.kind === 'session') {
        if (isNewer || this.session === null) this.session = parsed.session;
      } else if (isNewer || !this.rows.has(parsed.row.seq)) {
        this.rows.set(parsed.row.seq, { row: parsed.row, length: line.length });
      }
    }
  }

  transcript(context: ChatProjectionContext): ChatTranscript {
    const projection = new HermesProjection(context);
    const { transcript } = projection;
    transcript.title = this.session?.title ?? null;
    transcript.diagnostics.invalidLines = this.malformed.size;
    transcript.diagnostics.oversizedLines = this.cut.size;
    const ordered = [...this.rows.values()].sort((a, b) => a.row.seq - b.row.seq);
    for (const held of ordered) projection.add(held.row, held.length);
    projection.finish();
    return transcript;
  }

  output(line: ChatLine, _tool: ChatToolActivity): ChatToolOutput | null {
    if (isTruncatedLine(line)) return null;
    const parsed = readHermesLine(line.data);
    return parsed.kind === 'row' && parsed.row.role === 'tool'
      ? hermesToolOutput(parsed.row)
      : null;
  }
}
