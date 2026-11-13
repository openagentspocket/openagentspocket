// Rebuilds a paginated rollout's turns the way Codex materializes them (Swift
// CodexPaginatedBuilder).
//
// Ordinal hygiene mirrors `thread_history_materialization.rs`: a line Codex rejects takes no
// ordinal; a repeated ordinal keeps its first line; a gap is only counted. Projection mirrors
// `thread_history_projection.rs`: a turn sorts by the first line that names it and keeps the
// first terminal status its segment records; an item keeps the position of its first snapshot and
// the content of its latest. A tool call first recorded after its turn completed joins the turn's
// steps above its final answer. A turn started under the root of a turn already in the file is
// that turn's forwarded work (a review's reviewer turn): its items join the root turn, and its
// prompt is not the user's message.
//
// Response items are never rows (their `item_completed` twins are), except the sync
// `request_user_input` call, a code-mode patch the user aborted, and a code-mode command until its
// CommandExecution twin is recorded (one waiting for approval, or declined, never gets one).

import {
  type Accepted,
  assembleTimeline,
  type CodexOrdinalDiagnostics,
  codeModeOutcome,
  emptyOrdinals,
  type PendingCodeModeCall,
  type Position,
  type Turn,
  turnIDNamed,
} from './paginated-types';
import type {
  CodexItem,
  CodexRecord,
  CodexStoredLine,
  CodexToolSnapshot,
  CodexTurnTimes,
} from './record';
import type { CodexSegment } from './segment';
import {
  type CodexQuestionBuild,
  type CodexTimeline,
  type CodexTimelineContent,
  type CodexTimelineEntry,
  type CodexTurnStatus,
  emptyQuestionBuild,
} from './timeline';

export { type CodexOrdinalDiagnostics, emptyOrdinals } from './paginated-types';

class PaginatedBuilder {
  private readonly turns = new Map<string, Turn>();
  /** Question calls by `call_id`, with the turn holding their row. */
  private readonly questionTurns = new Map<string, string>();
  /** Code-mode patch and command calls by `call_id`, until their output arrives. */
  private readonly codeModeCalls = new Map<string, PendingCodeModeCall>();
  private currentTurnID: string | null = null;
  /** Turns whose items join their root turn, by turn id. */
  private readonly forwardedTurns = new Map<string, string>();
  private namedTurns = new Set<string>();
  readonly ordinals = emptyOrdinals();

  build(segments: readonly CodexSegment[]): CodexTimeline {
    const accepted = segments.map((segment) => this.accepted(segment));
    this.namedTurns = new Set(
      accepted.flat().flatMap(({ record }) => {
        const id = turnIDNamed(record);
        return id === null ? [] : [id];
      }),
    );
    segments.forEach((segment, index) => {
      for (const { record, line } of accepted[index] as Accepted[]) {
        this.apply(record, line, segment, { segment: index, offset: line.offset });
      }
    });
    return assembleTimeline(this.turns);
  }

  /** The records `segment` contributes, in file order, counting ordinal problems on the way. */
  private accepted(segment: CodexSegment): Accepted[] {
    const records: Accepted[] = [];
    // A window that does not start at the head has no expected ordinal until its first accepted
    // line sets one.
    let next: number | null = null;
    for (const line of segment.lines) {
      if (!line.outcome.isAccepted) continue;
      const ordinal = line.ordinal;
      if (ordinal === null) {
        this.ordinals.missing += 1;
        continue;
      }
      if (next !== null && ordinal < next) {
        this.ordinals.duplicates += 1;
        continue;
      }
      if (next !== null && ordinal > next) this.ordinals.gaps += 1;
      next = ordinal + 1;
      if (segment.endOrdinalExclusive !== null && ordinal >= segment.endOrdinalExclusive) continue;
      const start = segment.meta.subagentHistoryStartOrdinal;
      if (start !== null && ordinal < start) {
        this.ordinals.inherited += 1;
        continue;
      }
      if (line.outcome.record) records.push({ record: line.outcome.record, line });
    }
    return records;
  }

  private apply(
    record: CodexRecord,
    line: CodexStoredLine,
    segment: CodexSegment,
    position: Position,
  ): void {
    switch (record.type) {
      case 'turnStarted': {
        let turnID = record.turnID;
        if (record.rootTurnID !== null && this.namedTurns.has(record.rootTurnID)) {
          this.forwardedTurns.set(record.turnID, record.rootTurnID);
          turnID = record.rootTurnID;
        }
        this.touch(turnID, position);
        const turn = this.turns.get(turnID);
        // A review turn has no start of its own; its reviewer's stands for it.
        if (turn) turn.sawStart = true;
        this.note(record.times, turnID);
        this.setStatus('inProgress', turnID, null, line, segment, position);
        this.currentTurnID = turnID;
        return;
      }
      case 'turnCompleted': {
        const turnID = this.forwardedTurns.get(record.turnID) ?? record.turnID;
        this.touch(turnID, position);
        this.note(record.times, turnID);
        if (record.error !== null) {
          this.setStatus(
            'failed',
            turnID,
            { type: 'failed', message: record.error },
            line,
            segment,
            position,
          );
        } else {
          this.setStatus('completed', turnID, null, line, segment, position);
        }
        return;
      }
      case 'turnAborted': {
        if (record.turnID === null) return;
        const turnID = this.forwardedTurns.get(record.turnID) ?? record.turnID;
        this.touch(turnID, position);
        this.note(record.times, turnID);
        const ending: CodexTimelineContent | null =
          record.reason === 'replaced' || record.reason === 'review_ended'
            ? null
            : { type: 'stopped', reason: record.reason, error: record.error };
        this.setStatus('interrupted', turnID, ending, line, segment, position);
        return;
      }
      case 'item':
        this.applyItem(record.turnID, record.item, line, segment, position);
        return;
      case 'questionCall': {
        const turnID = record.call.turnID ?? this.currentTurnID;
        if (turnID === null) return;
        this.touch(turnID, position);
        this.questionTurns.set(record.call.callID, turnID);
        this.updateQuestion(record.call.callID, turnID, line, segment, position, (q) => {
          q.questions = record.call.questions;
        });
        return;
      }
      case 'verifiedAnswer': {
        const turnID =
          this.questionTurns.get(record.answer.callID) ??
          record.answer.turnID ??
          this.currentTurnID;
        if (turnID === null) return;
        this.touch(turnID, position);
        this.questionTurns.set(record.answer.callID, turnID);
        this.updateQuestion(record.answer.callID, turnID, line, segment, position, (q) => {
          q.verified = record.answer.answers;
        });
        return;
      }
      case 'codeModeCall': {
        const named = record.call.turnID ?? this.currentTurnID;
        if (named === null) return;
        const call: PendingCodeModeCall = {
          turnID: this.forwardedTurns.get(named) ?? named,
          position,
          line,
          segment,
          snapshot: record.call.snapshot,
          commands: record.call.commands,
        };
        this.codeModeCalls.set(record.call.callID, call);
        // A command shows at once: waiting for approval, it has nothing else in the rollout.
        if (call.commands !== null) this.placeCodeModeRow(record.call.callID, call, {});
        return;
      }
      case 'callOutput':
        this.applyOutput(record.output, line, segment, position);
        return;
      default:
        // Legacy records, and an abort without a turn id, name no turn here.
        return;
    }
  }

  private applyItem(
    named: string,
    item: CodexItem,
    line: CodexStoredLine,
    segment: CodexSegment,
    position: Position,
  ): void {
    const turnID = this.forwardedTurns.get(named) ?? named;
    if (turnID !== named && item.content.type === 'user') return;
    this.touch(turnID, position);
    const turn = this.turns.get(turnID);
    if (!turn) return;
    const existing = turn.items.get(item.id);
    if (existing) {
      existing.entry.content = { type: 'item', value: item.content };
      return;
    }
    turn.items.set(item.id, {
      position,
      entry: this.entry(
        item.id,
        item.id,
        turnID,
        { type: 'item', value: item.content },
        line,
        segment,
      ),
      question: null,
      codeModeCommands: null,
      isLate: item.content.type === 'tool' && turn.status === 'completed',
    });
  }

  private applyOutput(
    output: Extract<CodexRecord, { type: 'callOutput' }>['output'],
    line: CodexStoredLine,
    segment: CodexSegment,
    position: Position,
  ): void {
    const call = this.codeModeCalls.get(output.callID);
    if (call && (output.isAbortedByUser || (call.commands !== null && output.scriptStatus))) {
      this.codeModeCalls.delete(output.callID);
      this.placeCodeModeRow(output.callID, call, codeModeOutcome(call, output));
      return;
    }
    // Outputs of other calls are not rows in a paginated rollout.
    const turnID = this.questionTurns.get(output.callID);
    if (turnID === undefined) return;
    this.updateQuestion(output.callID, turnID, line, segment, position, (q) => {
      q.hasOutput = true;
      q.outputAnswers = output.answers;
    });
  }

  /** Places (or replaces) a code-mode call's row at its call's position, with `outcome` applied. */
  private placeCodeModeRow(
    callID: string,
    call: PendingCodeModeCall,
    outcome: Partial<CodexToolSnapshot>,
  ): void {
    this.touch(call.turnID, call.position);
    const turn = this.turns.get(call.turnID);
    if (!turn) return;
    const row: CodexTimelineContent = {
      type: 'item',
      value: { type: 'tool', value: { ...call.snapshot, ...outcome } },
    };
    turn.items.set(callID, {
      position: call.position,
      entry: {
        ...this.entry(callID, null, call.turnID, row, call.line, call.segment),
        // Swift reads a code-mode call only for a patch.
        ...(call.commands === null ? {} : { isPortOnly: true }),
      },
      question: null,
      codeModeCommands: call.commands ?? [],
      isLate: false,
    });
  }

  private touch(turnID: string, position: Position): void {
    if (this.turns.has(turnID)) return;
    this.turns.set(turnID, {
      id: turnID,
      position,
      status: null,
      statusSegment: -1,
      ending: null,
      items: new Map(),
      startedAt: null,
      endedAt: null,
      sawStart: false,
    });
  }

  /** Keeps the first start and the latest end a turn event gives. */
  private note(times: CodexTurnTimes, turnID: string): void {
    const turn = this.turns.get(turnID);
    if (!turn) return;
    if (turn.startedAt === null) turn.startedAt = times.startedAt;
    if (times.completedAt !== null) turn.endedAt = times.completedAt;
  }

  /** Records a status unless the turn already ended in this segment: the first terminal wins. */
  private setStatus(
    status: CodexTurnStatus,
    turnID: string,
    ending: CodexTimelineContent | null,
    line: CodexStoredLine,
    segment: CodexSegment,
    position: Position,
  ): void {
    const turn = this.turns.get(turnID);
    if (!turn) return;
    const ended = turn.status !== null && turn.status !== 'inProgress';
    if (ended && turn.statusSegment >= position.segment) return;
    turn.status = status;
    turn.statusSegment = position.segment;
    turn.ending = ending
      ? this.entry(
          ending.type === 'failed' ? '~failed' : '~stopped',
          null,
          turnID,
          ending,
          line,
          segment,
        )
      : null;
  }

  /** Updates a question row, creating it at this line's position when no earlier line placed it. */
  private updateQuestion(
    callID: string,
    turnID: string,
    line: CodexStoredLine,
    segment: CodexSegment,
    position: Position,
    update: (question: CodexQuestionBuild) => void,
  ): void {
    const turn = this.turns.get(turnID);
    if (!turn) return;
    let item = turn.items.get(callID);
    if (!item) {
      item = {
        position,
        entry: this.entry(
          callID,
          null,
          turnID,
          { type: 'item', value: { type: 'compaction' } },
          line,
          segment,
        ),
        question: null,
        codeModeCommands: null,
        isLate: false,
      };
      turn.items.set(callID, item);
    }
    const build = item.question ?? emptyQuestionBuild();
    update(build);
    item.question = build;
  }

  /** An entry first placed by `line`. Its id and offset never change. */
  private entry(
    key: string,
    itemID: string | null,
    turnID: string,
    content: CodexTimelineContent,
    line: CodexStoredLine,
    segment: CodexSegment,
  ): CodexTimelineEntry {
    return {
      id: `codex/${segment.rolloutID}/${turnID}/${key}`,
      sourceOffset: line.offset,
      itemID,
      rolloutID: segment.rolloutID,
      path: segment.path,
      content,
    };
  }
}

/** The timeline of `segments`, oldest first, each already cut to the range it contributes. */
export function buildPaginated(segments: readonly CodexSegment[]): {
  timeline: CodexTimeline;
  ordinals: CodexOrdinalDiagnostics;
} {
  const builder = new PaginatedBuilder();
  const timeline = builder.build(segments);
  return { timeline, ordinals: builder.ordinals };
}
