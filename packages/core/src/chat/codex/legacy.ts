// Rebuilds a legacy rollout's turns by replaying its events through the rules of Codex's
// `ThreadHistoryBuilder` (Swift CodexLegacyBuilder).
//
// Legacy rollouts persist events rather than turn items, and turns are implicit unless a
// `task_started` opened them: a user message closes an implicit turn (unless it holds only a
// compaction), completion and abort events find their turn by id with fallbacks, and
// `thread_rolled_back` drops whole turns. Lines have no ordinals, so entries are keyed by byte
// offset (`codex/<rollout>/@<offset>`). Codex's builder ignores tool response items; Agentico
// pairs them by `call_id` so legacy tool calls show as rows, and merges the `*_end` events that
// share a call id into the same row.

import {
  applyingOutput,
  type Item,
  lastIndexOfKey,
  mergedWith,
  newTurn,
  type Turn,
} from './legacy-types';
import type {
  CodexItem,
  CodexLegacyPlacement,
  CodexRecord,
  CodexStoredLine,
  CodexToolCall,
} from './record';
import type { CodexSegment } from './segment';
import {
  type CodexQuestionBuild,
  type CodexTimeline,
  type CodexTimelineContent,
  type CodexTimelineEntry,
  type CodexTurnStatus,
  emptyQuestionBuild,
  questionState,
} from './timeline';

class LegacyBuilder {
  private turns: Turn[] = [];
  private current: Turn | null = null;

  constructor(private readonly segment: CodexSegment) {}

  build(): CodexTimeline {
    for (const line of this.segment.lines) {
      if (line.outcome.isAccepted && line.outcome.record) this.apply(line.outcome.record, line);
    }
    return this.timeline();
  }

  private apply(record: CodexRecord, line: CodexStoredLine): void {
    switch (record.type) {
      case 'turnStarted':
        this.finishCurrent();
        this.current = newTurn(record.turnID, true, 'inProgress');
        return;
      case 'turnCompleted':
        this.complete(record.turnID, record.error, line);
        return;
      case 'turnAborted':
        this.abort(record.turnID, record.reason, record.error, line);
        return;
      case 'userMessage': {
        const turn = this.current;
        if (turn && !turn.isExplicit && !(turn.sawCompaction && turn.items.length === 0)) {
          this.finishCurrent();
        }
        this.push({ type: 'item', value: { type: 'user', value: record.content } }, line);
        return;
      }
      case 'agentMessage': {
        const content = record.content;
        if (content.text === '' && content.questions.length === 0) return;
        const turn = this.ensureTurn(line);
        const itemID = content.questions.length === 0 ? null : (turn.asyncCalls.pop() ?? null);
        this.push({ type: 'item', value: { type: 'agent', value: content } }, line, { itemID });
        return;
      }
      case 'reasoning': {
        if (record.text === '') return;
        const turn = this.ensureTurn(line);
        const last = turn.items[turn.items.length - 1];
        if (
          last &&
          last.entry.content.type === 'item' &&
          last.entry.content.value.type === 'reasoning'
        ) {
          const existing = last.entry.content.value;
          last.entry.content = {
            type: 'item',
            value: {
              type: 'reasoning',
              text: `${existing.text}\n\n${record.text}`,
              durationMilliseconds: existing.durationMilliseconds,
            },
          };
        } else {
          this.push(
            {
              type: 'item',
              value: { type: 'reasoning', text: record.text, durationMilliseconds: null },
            },
            line,
          );
        }
        return;
      }
      case 'contextCompacted':
        this.push({ type: 'item', value: { type: 'compaction' } }, line);
        return;
      case 'compacted':
        this.ensureTurn(line).sawCompaction = true;
        return;
      case 'rolledBack':
        this.finishCurrent();
        this.turns.splice(this.turns.length - Math.min(record.turns, this.turns.length));
        return;
      case 'toolCall':
        this.applyCall(record.call, line);
        return;
      case 'callOutput': {
        const output = record.output;
        this.update(output.callID, (item) => {
          if (item.question) {
            item.question.hasOutput = true;
            item.question.outputAnswers = output.answers;
          } else if (
            item.entry.content.type === 'item' &&
            item.entry.content.value.type === 'tool'
          ) {
            item.entry.content = {
              type: 'item',
              value: {
                type: 'tool',
                value: applyingOutput(item.entry.content.value.value, output),
              },
            };
          }
        });
        return;
      }
      case 'verifiedAnswer': {
        const answers = record.answer.answers;
        this.update(record.answer.callID, (item) => {
          if (item.question) item.question.verified = answers;
        });
        return;
      }
      case 'legacyItem':
        this.applyLegacyItem(record.item, record.placement, line);
        return;
      default:
        // Paginated records.
        return;
    }
  }

  private applyLegacyItem(
    item: CodexItem,
    placement: CodexLegacyPlacement,
    line: CodexStoredLine,
  ): void {
    if (item.content.type === 'tool' && item.content.value.callID !== null) {
      const end = item.content.value;
      const merged = this.update(end.callID as string, (existing) => {
        const content = existing.entry.content;
        if (content.type === 'item' && content.value.type === 'tool') {
          existing.entry.content = {
            type: 'item',
            value: { type: 'tool', value: mergedWith(content.value.value, end) },
          };
        }
      });
      if (merged) return;
    }
    this.place(item, placement, line);
  }

  private applyCall(call: CodexToolCall, line: CodexStoredLine): void {
    const role = call.role;
    if (role.type === 'tool') {
      const row = role.snapshot;
      const merged = this.update(call.callID, (existing) => {
        const content = existing.entry.content;
        if (content.type === 'item' && content.value.type === 'tool') {
          existing.entry.content = {
            type: 'item',
            value: { type: 'tool', value: mergedWith(row, content.value.value) },
          };
        }
      });
      if (!merged)
        this.push({ type: 'item', value: { type: 'tool', value: row } }, line, {
          key: call.callID,
        });
    } else if (role.type === 'question') {
      const merged = this.update(call.callID, (existing) => {
        if (existing.question) existing.question.questions = role.questions;
      });
      if (!merged) {
        this.push({ type: 'item', value: { type: 'compaction' } }, line, {
          key: call.callID,
          question: emptyQuestionBuild(role.questions),
        });
      }
    } else {
      this.ensureTurn(line).asyncCalls.push(call.callID);
    }
  }

  // MARK: Turn lifecycle

  /** `handle_turn_complete`: the current turn by id, then an earlier turn by id, else the current. */
  private complete(turnID: string, error: string | null, line: CodexStoredLine): void {
    const ending = this.entry(`@${line.offset}`, { type: 'failed', message: error }, line);
    const apply = (turn: Turn): void => {
      if (error !== null) {
        turn.status = 'failed';
        turn.ending = ending;
      } else if (turn.status === 'completed' || turn.status === 'inProgress') {
        turn.status = 'completed';
      }
    };
    if (this.current && this.current.id === turnID) {
      apply(this.current);
      this.finishCurrent();
      return;
    }
    const earlier = this.turns.find((turn) => turn.id === turnID);
    if (earlier) {
      apply(earlier);
    } else if (this.current) {
      apply(this.current);
      this.finishCurrent();
    }
  }

  /** `handle_turn_aborted`: the turn named by id, else the current one; it does not finish it. */
  private abort(
    turnID: string | null,
    reason: string,
    error: string | null,
    line: CodexStoredLine,
  ): void {
    const ending =
      reason === 'replaced' || reason === 'review_ended'
        ? null
        : this.entry(`@${line.offset}`, { type: 'stopped', reason, error }, line);
    const apply = (turn: Turn): void => {
      turn.status = 'interrupted';
      turn.ending = ending;
    };
    if (turnID !== null && this.current && this.current.id === turnID) apply(this.current);
    else if (turnID !== null && this.turns.some((turn) => turn.id === turnID)) {
      apply(this.turns.find((turn) => turn.id === turnID) as Turn);
    } else if (this.current) apply(this.current);
  }

  /** Ends the current turn; an implicit turn with nothing in it vanishes. */
  private finishCurrent(): void {
    const turn = this.current;
    if (!turn) return;
    this.current = null;
    if (turn.items.length === 0 && !turn.isExplicit && !turn.sawCompaction) return;
    this.turns.push(turn);
  }

  /** The current turn, opening an implicit one at `line` when there is none. */
  private ensureTurn(line: CodexStoredLine): Turn {
    if (!this.current) this.current = newTurn(`legacy@${line.offset}`, false, 'completed');
    return this.current;
  }

  // MARK: Items

  private push(
    content: CodexTimelineContent,
    line: CodexStoredLine,
    extra: { key?: string; itemID?: string | null; question?: CodexQuestionBuild } = {},
  ): void {
    const turn = this.ensureTurn(line);
    const entry = this.entry(`@${line.offset}`, content, line);
    entry.itemID = extra.itemID ?? null;
    turn.items.push({
      key: extra.key ?? `@${line.offset}`,
      entry,
      question: extra.question ?? null,
    });
  }

  /** `upsert_item_in_turn_id` and friends. */
  private place(item: CodexItem, placement: CodexLegacyPlacement, line: CodexStoredLine): void {
    const turnID =
      placement.type === 'turn'
        ? placement.turnID
        : placement.type === 'current'
          ? null
          : placement.turnID;
    if (placement.type === 'review' && turnID !== null) {
      // A review item opens its turn when no line has yet.
      if (this.current?.id !== turnID && !this.turns.some((turn) => turn.id === turnID)) {
        this.finishCurrent();
        this.current = newTurn(turnID, false, 'completed');
      }
    } else if (turnID === null) {
      this.ensureTurn(line);
    }
    this.upsert(item, turnID, line);
  }

  /** Replaces the item with the same id in the turn, or appends it. An unknown id drops it. */
  private upsert(item: CodexItem, turnID: string | null, line: CodexStoredLine): void {
    const content: CodexTimelineContent = { type: 'item', value: item.content };
    const into = (turn: Turn): void => {
      const index = lastIndexOfKey(turn, item.id);
      if (index >= 0) (turn.items[index] as Item).entry.content = content;
      else {
        turn.items.push({
          key: item.id,
          entry: this.entry(`@${line.offset}`, content, line),
          question: null,
        });
      }
    };
    if (this.current && (turnID === null || this.current.id === turnID)) {
      into(this.current);
      return;
    }
    const turn = turnID === null ? undefined : this.turns.find((t) => t.id === turnID);
    if (turn) into(turn);
  }

  /** Applies `change` to the row keyed `key`, newest turn first. False when no turn holds it. */
  private update(key: string, change: (item: Item) => void): boolean {
    if (this.current) {
      const index = lastIndexOfKey(this.current, key);
      if (index >= 0) {
        change(this.current.items[index] as Item);
        return true;
      }
    }
    for (let t = this.turns.length - 1; t >= 0; t -= 1) {
      const turn = this.turns[t] as Turn;
      const index = lastIndexOfKey(turn, key);
      if (index >= 0) {
        change(turn.items[index] as Item);
        return true;
      }
    }
    return false;
  }

  private entry(
    key: string,
    content: CodexTimelineContent,
    line: CodexStoredLine,
  ): CodexTimelineEntry {
    return {
      id: `codex/${this.segment.rolloutID}/${key}`,
      sourceOffset: line.offset,
      itemID: null,
      rolloutID: this.segment.rolloutID,
      path: this.segment.path,
      content,
    };
  }

  private timeline(): CodexTimeline {
    const all: [Turn, CodexTurnStatus | null][] = this.turns.map((turn) => [turn, turn.status]);
    const open = this.current;
    if (open && (open.items.length > 0 || open.isExplicit || open.sawCompaction)) {
      // The turn still open at the end: an implicit one has no status of its own yet.
      all.push([open, !open.isExplicit && open.status === 'completed' ? null : open.status]);
    }
    return {
      leading: [],
      turns: all.map(([turn, status]) => ({
        id: turn.id,
        status,
        entries: turn.items.map((item) =>
          item.question
            ? {
                ...item.entry,
                content: { type: 'question', value: questionState(item.question, item.key) },
              }
            : item.entry,
        ),
        ending: turn.ending,
        startedAt: null,
        endedAt: null,
        opensInWindow: true,
      })),
    };
  }
}

export function buildLegacy(segment: CodexSegment): CodexTimeline {
  return new LegacyBuilder(segment).build();
}
