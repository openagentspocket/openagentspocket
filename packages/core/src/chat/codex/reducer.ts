// The Codex rollout reducer (Swift CodexRolloutReducer): turns a rollout's lines into Chat
// entries. It keeps one decoded record per line and rebuilds the timeline from them, so a window
// never holds tool output in memory. Lines are fed by byte offset and may overlap; lines that
// arrive earlier than the first one wait whole.
//
// A reverted paginated rollout continues history kept in older files. The reducer cannot read
// files, so it names the base it needs in `pendingHistoryBase` and takes that file's lines through
// `setBaseSegment`, one base at a time.

import { type ChatLine, isTruncatedLine, lineEnd } from '../model/lines';
import type { ChatToolOutput, ChatTranscriptReducer } from '../model/reducer';
import {
  type AgentContextUsage,
  type ChatProjectionContext,
  type ChatToolActivity,
  type ChatTranscript,
  type ChatTranscriptDiagnostics,
  emptyTranscript,
} from '../model/types';
import { CLASSIFIER_PREFIX_LIMIT, classifyLine } from './classifier';
import { decodeLine } from './decoder';
import { decodeContext } from './decoder-common';
import { buildLegacy } from './legacy';
import { buildPaginated, type CodexOrdinalDiagnostics, emptyOrdinals } from './paginated';
import { projectTimeline } from './projector';
import { type CodexStoredLine, INVALID, storedEnd } from './record';
import {
  type CodexHistoryBase,
  type CodexRolloutSupport,
  type CodexSegment,
  type CodexSessionMeta,
  detectSupport,
} from './segment';
import {
  type CodexEchoCandidate,
  type CodexTimeline,
  type CodexTurnSummary,
  emptyTimeline,
} from './timeline';
import { contextUsageIn } from './token-count';

/** Bumped when the normalization changes, so entries cached by an older build are dropped. */
export const CODEX_REVISION = 11;

/** A projection plus what tests and pending-echo matching need beyond the shared transcript. */
export interface CodexProjection {
  transcript: ChatTranscript;
  turns: CodexTurnSummary[];
  /** The live rollout's prompts and compactions, in transcript order. */
  echoCandidates: CodexEchoCandidate[];
  ordinals: CodexOrdinalDiagnostics;
}

const UNSUPPORTED_TEXT = {
  preEnvelope: 'a rollout from Codex 0.30 or earlier',
  noSessionMeta: 'a rollout that does not start with its session record',
  unknownHistoryMode: 'a rollout with a history mode Chat does not know',
} as const;

export class CodexRolloutReducer implements ChatTranscriptReducer {
  support: CodexRolloutSupport = { type: 'pending' };
  private meta: CodexSessionMeta | null = null;
  /** Lines received while `support` is pending, in file order. */
  private undecided: ChatLine[] = [];
  private lines: CodexStoredLine[] = [];
  /** Base segments, nearest first. */
  private bases: CodexSegment[] = [];
  /** The rollout whose base could not be read, when one could not. */
  private unavailableBaseOf: string | null = null;
  private timeline: CodexTimeline = emptyTimeline();
  private ordinals = emptyOrdinals();
  private diagnostics: ChatTranscriptDiagnostics = {
    invalidLines: 0,
    oversizedLines: 0,
    unknownRecordTypes: new Set(),
  };
  /** The newest `token_count` among the live lines fed so far, by offset. */
  private contextSample: { offset: number; usage: AgentContextUsage } | null = null;

  constructor(readonly rolloutID: string) {}

  /** Names a rollout this reducer does not read, for Chat to explain. */
  get unsupportedFormat(): string | null {
    return this.support.type === 'unsupported' ? UNSUPPORTED_TEXT[this.support.reason] : null;
  }

  get dialect(): 'paginated' | 'legacy' | null {
    return this.support.type === 'supported' ? this.support.dialect : null;
  }

  /** The live rollout's `history_base`, set when it continues a reverted history. */
  get historyBase(): CodexHistoryBase | null {
    return this.meta?.historyBase ?? null;
  }

  /** The base the lineage needs next, until the chain ends or a base cannot be read. */
  get pendingHistoryBase(): CodexHistoryBase | null {
    if (this.dialect !== 'paginated' || this.unavailableBaseOf !== null) return null;
    const oldest = this.bases[this.bases.length - 1]?.meta ?? this.meta;
    return oldest?.historyBase ?? null;
  }

  /** Reads the dialect from line 1 when a tail window does not include it. */
  setSessionMeta(line: ChatLine): void {
    if (this.support.type !== 'pending') return;
    this.adopt(line);
    this.rebuild();
  }

  /** Lines already fed are ignored, so a caller may resend an overlap. */
  append(newLines: readonly ChatLine[]): void {
    const last = this.lines[this.lines.length - 1];
    const waiting = this.undecided[this.undecided.length - 1];
    const end = last ? storedEnd(last) : waiting ? lineEnd(waiting) : 0;
    this.receive(
      newLines.filter((line) => line.offset >= end),
      true,
    );
  }

  prepend(newLines: readonly ChatLine[]): void {
    const first = this.lines[0];
    const waiting = this.undecided[0];
    const start = first ? first.offset : waiting ? waiting.offset : Number.MAX_SAFE_INTEGER;
    this.receive(
      newLines.filter((line) => lineEnd(line) <= start),
      false,
    );
  }

  /**
   * Supplies the base named by `pendingHistoryBase`: the base file's lines over
   * `[0, end_byte_offset)`. The boundary must fall exactly after the line whose ordinal is
   * `end_ordinal_exclusive - 1`; otherwise, or when the file is gone, the lineage stops there and
   * the transcript shows that older history is unavailable.
   */
  setBaseSegment(baseID: string, path: string, baseLines: readonly ChatLine[]): void {
    const base = this.pendingHistoryBase;
    if (!base || base.baseRolloutID !== baseID) return;
    const known = new Set([this.rolloutID, ...this.bases.map((b) => b.rolloutID)]);
    const segment = known.has(baseID) ? null : baseSegment(base, baseID, path, baseLines);
    if (segment) this.bases.push(segment);
    else this.unavailableBaseOf = this.bases[this.bases.length - 1]?.rolloutID ?? this.rolloutID;
    this.rebuild();
  }

  transcript(context: ChatProjectionContext): ChatTranscript {
    return this.projection(context).transcript;
  }

  /** The call's output from its item, end event or response line, decoded whatever its size. */
  output(line: ChatLine, tool: ChatToolActivity): ChatToolOutput | null {
    const dialect = this.dialect;
    if (!dialect) return null;
    const context = decodeContext(dialect, this.meta?.cwd ?? null, Number.MAX_SAFE_INTEGER);
    const record = decodeStored(line, context).outcome.record;
    if (!record) return null;
    let preview = null;
    if (record.type === 'item' || record.type === 'legacyItem') {
      const content = record.item.content;
      if (content.type !== 'tool' || content.value.callID !== tool.callID) return null;
      preview = content.value.preview;
    } else if (record.type === 'callOutput') {
      if (record.output.callID !== tool.callID) return null;
      preview = record.output.preview;
    } else {
      return null;
    }
    return { type: 'preview', preview, fileChanges: null };
  }

  projection(context: ChatProjectionContext): CodexProjection {
    let timeline = this.timeline;
    if (context.windowStart > 0) {
      // Older history sits above lines the window has not loaded yet.
      timeline = liveOnly(timeline, this.rolloutID);
    }
    const output = projectTimeline(timeline, context, this.rolloutID);
    const transcript: ChatTranscript = {
      ...emptyTranscript(),
      entries: output.entries,
      needsOlderHistory: context.windowStart > 0 || this.pendingHistoryBase !== null,
      pendingRequests: output.pendingRequests,
      recordedPrompts: output.recordedPrompts,
      diagnostics: this.diagnostics,
      turns: output.chatTurns,
      precedingTurnEnd: output.precedingTurnEnd,
      contextUsage: this.contextSample?.usage ?? null,
    };
    return {
      transcript,
      turns: output.turns,
      echoCandidates: output.echoCandidates,
      ordinals: this.ordinals,
    };
  }

  // MARK: Lines

  /** Keeps the context share of the newest `token_count` line. */
  private adoptContext(newLines: readonly ChatLine[]): void {
    for (const line of newLines) {
      if (isTruncatedLine(line)) continue;
      if (this.contextSample && line.offset <= this.contextSample.offset) continue;
      const usage = contextUsageIn(line.data);
      if (usage) this.contextSample = { offset: line.offset, usage };
    }
  }

  private receive(incoming: readonly ChatLine[], atEnd: boolean): void {
    const newLines = [...incoming].sort((a, b) => a.offset - b.offset);
    if (newLines.length === 0) return;
    this.adoptContext(newLines);
    if (this.support.type === 'pending') {
      const head = newLines.find((line) => line.offset === 0);
      if (head) this.adopt(head);
    }
    switch (this.support.type) {
      case 'pending':
        this.undecided = atEnd
          ? [...this.undecided, ...newLines]
          : [...newLines, ...this.undecided];
        return;
      case 'unsupported':
        return;
      case 'supported': {
        const decoded = newLines.map((line) => this.decode(line));
        this.lines = atEnd ? [...this.lines, ...decoded] : [...decoded, ...this.lines];
      }
    }
    this.rebuild();
  }

  /** Reads the dialect from a `session_meta` line and decodes whatever waited for it. */
  private adopt(line: ChatLine): void {
    const { support, meta } = detectSupport(line);
    this.support = support;
    this.meta = meta;
    const waiting = this.undecided;
    this.undecided = [];
    if (support.type === 'supported')
      this.lines = [...waiting.map((l) => this.decode(l)), ...this.lines];
  }

  private decode(line: ChatLine): CodexStoredLine {
    const dialect = this.dialect;
    if (!dialect) {
      return { offset: line.offset, length: line.length, ordinal: null, outcome: INVALID };
    }
    return decodeStored(line, decodeContext(dialect, this.meta?.cwd ?? null));
  }

  // MARK: Rebuild

  private rebuild(): void {
    const diagnostics: ChatTranscriptDiagnostics = {
      invalidLines: 0,
      oversizedLines: 0,
      unknownRecordTypes: new Set(),
    };
    const unknown = diagnostics.unknownRecordTypes as Set<string>;
    for (const line of [...this.lines, ...this.bases.flatMap((base) => base.lines)]) {
      if (line.outcome.isInvalid) diagnostics.invalidLines += 1;
      if (line.outcome.isOversized) diagnostics.oversizedLines += 1;
      if (line.outcome.unknownType !== null) unknown.add(line.outcome.unknownType);
    }
    this.diagnostics = diagnostics;
    const dialect = this.dialect;
    if (!dialect || !this.meta) {
      this.timeline = emptyTimeline();
      this.ordinals = emptyOrdinals();
      return;
    }
    const live: CodexSegment = {
      rolloutID: this.rolloutID,
      path: null,
      meta: this.meta,
      lines: this.lines,
      endOrdinalExclusive: null,
    };
    if (dialect === 'paginated') {
      const built = buildPaginated([...[...this.bases].reverse(), live]);
      this.timeline = built.timeline;
      this.ordinals = built.ordinals;
    } else {
      this.timeline = buildLegacy(live);
      this.ordinals = emptyOrdinals();
    }
    if (this.unavailableBaseOf !== null) {
      this.timeline.leading = [
        {
          id: `codex/${this.unavailableBaseOf}/~history-unavailable`,
          sourceOffset: 0,
          itemID: null,
          rolloutID: this.unavailableBaseOf,
          path: this.bases[this.bases.length - 1]?.path ?? null,
          content: { type: 'divider', value: { kind: 'historyUnavailable', detail: null } },
        },
      ];
    }
  }
}

function decodeStored(line: ChatLine, context: ReturnType<typeof decodeContext>): CodexStoredLine {
  let classification = classifyLine(line.data);
  if (classification.kind.type === 'unclassified' && line.data.length > CLASSIFIER_PREFIX_LIMIT) {
    classification = classifyLine(line.data, line.data.length);
  }
  return {
    offset: line.offset,
    length: line.length,
    ordinal: classification.ordinal,
    outcome: decodeLine(line, classification, context),
  };
}

/** A base file's lines as a segment, or null when they do not end at the recorded boundary. */
function baseSegment(
  base: CodexHistoryBase,
  rolloutID: string,
  path: string,
  lines: readonly ChatLine[],
): CodexSegment | null {
  const within = lines
    .filter((l) => lineEnd(l) <= base.endByteOffset)
    .sort((a, b) => a.offset - b.offset);
  const head = within[0];
  const last = within[within.length - 1];
  if (base.endOrdinalExclusive <= 0 || !head || head.offset !== 0 || !last) return null;
  if (lineEnd(last) !== base.endByteOffset) return null;
  const detected = detectSupport(head);
  if (
    detected.support.type !== 'supported' ||
    detected.support.dialect !== 'paginated' ||
    !detected.meta
  ) {
    return null;
  }
  const context = decodeContext('paginated', detected.meta.cwd);
  const stored = within.map((l) => decodeStored(l, context));
  const lastOrdinal = [...stored]
    .reverse()
    .find((l) => l.outcome.isAccepted && l.ordinal !== null)?.ordinal;
  if (lastOrdinal !== base.endOrdinalExclusive - 1) return null;
  return {
    rolloutID,
    path,
    meta: detected.meta,
    lines: stored,
    endOrdinalExclusive: base.endOrdinalExclusive,
  };
}

/** The timeline without base segments' entries, for a window that has not reached the head. */
function liveOnly(timeline: CodexTimeline, rolloutID: string): CodexTimeline {
  return {
    leading: [],
    turns: timeline.turns.flatMap((turn) => {
      const entries = turn.entries.filter((e) => e.rolloutID === rolloutID);
      const ending = turn.ending?.rolloutID === rolloutID ? turn.ending : null;
      return entries.length === 0 && ending === null ? [] : [{ ...turn, entries, ending }];
    }),
  };
}
