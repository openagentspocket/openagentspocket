// Writes synthetic Codex rollouts for tests, in the shapes the Swift CodexRolloutBuilder writes:
// paginated (every line has an ordinal, history is `item_completed` turn items) or legacy (no
// ordinals, history is events and response items). Object keys keep their written order, so
// `type` comes first the way Codex writes it: the classifier reads a line's first bytes only.

import { encodeUtf8 } from '../../events/utf8';
import { type ChatLine, frameLines } from '../model/lines';
import type { ChatProjectionContext } from '../model/types';
import { projectionContext } from '../model/types';
import { CodexRolloutReducer } from './reducer';

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type Fields = { [key: string]: Json };

export interface HistoryBaseInit {
  rolloutID: string;
  endOrdinal: number;
  endOffset: number;
}

export interface BuilderInit {
  dialect?: 'paginated' | 'legacy';
  threadID?: string;
  cwd?: string;
  historyBase?: HistoryBaseInit;
  subagentHistoryStartOrdinal?: number;
  firstOrdinal?: number;
}

export const IDLE: ChatProjectionContext = projectionContext({ activity: 'idle' });
export const WORKING: ChatProjectionContext = projectionContext({ activity: 'working' });

export class RolloutBuilder {
  readonly dialect: 'paginated' | 'legacy';
  lines: string[] = [];
  /** The ordinal the next paginated line takes. */
  nextOrdinal: number;

  constructor(init: BuilderInit = {}) {
    this.dialect = init.dialect ?? 'paginated';
    this.nextOrdinal = init.firstOrdinal ?? 0;
    const threadID = init.threadID ?? 'thread-1';
    const payload: Fields = {
      session_id: threadID,
      id: threadID,
      timestamp: '2026-10-06T00:00:00.000Z',
      cwd: init.cwd ?? '/work',
      originator: 'codex-tui',
      cli_version: '0.160.1',
      source: 'cli',
    };
    if (this.dialect === 'paginated') payload.history_mode = 'paginated';
    if (init.historyBase) {
      payload.history_base = {
        thread_id: init.historyBase.rolloutID,
        end_ordinal_exclusive: init.historyBase.endOrdinal,
        end_byte_offset: init.historyBase.endOffset,
      };
    }
    if (init.subagentHistoryStartOrdinal !== undefined) {
      payload.subagent_history_start_ordinal = init.subagentHistoryStartOrdinal;
    }
    this.record('session_meta', payload);
  }

  get text(): string {
    return this.lines.map((line) => `${line}\n`).join('');
  }

  get data(): Uint8Array {
    return encodeUtf8(this.text);
  }

  get chatLines(): ChatLine[] {
    return frameLines(this.data);
  }

  /** The byte offset where the next line will start. */
  get endOffset(): number {
    return this.data.length;
  }

  reducer(rolloutID = 'r1'): CodexRolloutReducer {
    const reducer = new CodexRolloutReducer(rolloutID);
    reducer.append(this.chatLines);
    return reducer;
  }

  /** One envelope line. `ordinal: null` writes none; a number overrides the next ordinal. */
  record(type: string, payload: Json, ordinal?: number | null): void {
    const members: Fields = { timestamp: '2026-10-06T00:00:00.000Z' };
    if (this.dialect === 'paginated' && ordinal !== null) {
      const value = ordinal ?? this.nextOrdinal;
      members.ordinal = value;
      this.nextOrdinal = value + 1;
    }
    members.type = type;
    members.payload = payload;
    this.lines.push(JSON.stringify(members));
  }

  /** A line written as is: a crash fragment, garbage. */
  raw(text: string): void {
    this.lines.push(text);
  }

  event(type: string, fields: Fields = {}, ordinal?: number | null): void {
    this.record('event_msg', { type, ...fields }, ordinal);
  }

  response(type: string, fields: Fields, ordinal?: number | null): void {
    this.record('response_item', { type, ...fields }, ordinal);
  }

  turnStarted(turnID: string): void {
    this.event('task_started', { turn_id: turnID, started_at: 1_791_266_142 });
  }

  turnComplete(turnID: string, error?: string): void {
    const fields: Fields = { turn_id: turnID, last_agent_message: null };
    if (error !== undefined) fields.error = { message: error };
    this.event('task_complete', fields);
  }

  turnAborted(turnID: string | null, reason = 'interrupted'): void {
    const fields: Fields = {};
    if (turnID !== null) fields.turn_id = turnID;
    fields.reason = reason;
    this.event('turn_aborted', fields);
  }

  /** `item_completed` with `item` as the turn item. */
  item(turnID: string, item: Json, ordinal?: number | null): void {
    this.event(
      'item_completed',
      { thread_id: 'thread-1', turn_id: turnID, item, completed_at_ms: 1_791_266_142_000 },
      ordinal,
    );
  }

  userMessage(turnID: string, id: string, text: string): void {
    this.item(turnID, {
      type: 'UserMessage',
      id,
      content: [{ type: 'text', text, text_elements: [] }],
    });
  }

  agentMessage(
    turnID: string,
    id: string,
    text: string,
    options: {
      phase?: string;
      delivery?: string;
      questions?: { title: string; options: string[] }[];
    } = {},
  ): void {
    const item: Fields = {
      type: 'AgentMessage',
      id,
      content: [{ type: 'Text', text }],
      phase: options.phase ?? 'final_answer',
    };
    if (options.delivery) item.delivery = options.delivery;
    if (options.questions) item.questions = options.questions;
    this.item(turnID, item);
  }

  command(
    turnID: string,
    id: string,
    argv: string[],
    options: { status?: string; exitCode?: number | null; output?: string } = {},
  ): void {
    const item: Fields = {
      type: 'CommandExecution',
      id,
      command: argv,
      cwd: 'file:///work',
      process_id: null,
      source: 'agent',
      status: options.status ?? 'completed',
      parsed_cmd: [],
      aggregated_output: options.output ?? '',
    };
    if (options.exitCode !== null) item.exit_code = options.exitCode ?? 0;
    this.item(turnID, item);
  }

  compaction(turnID: string, id: string): void {
    this.item(turnID, { type: 'ContextCompaction', id });
  }

  /** The top-level `compacted` record: model context only. */
  compacted(message: string): void {
    this.record('compacted', { message, replacement_history: [] });
  }

  legacyUser(text: string, kind?: string): void {
    const fields: Fields = { message: text };
    if (kind) fields.kind = kind;
    fields.images = null;
    this.event('user_message', fields);
  }

  legacyAgent(text: string): void {
    this.event('agent_message', { message: text });
  }

  legacyReasoning(text: string): void {
    this.event('agent_reasoning', { text });
  }

  legacyCall(name: string, callID: string, args: Json): void {
    this.response('function_call', { name, arguments: JSON.stringify(args), call_id: callID });
  }

  legacyOutput(callID: string, output: string): void {
    this.response('function_call_output', { call_id: callID, output });
  }

  rolledBack(turns: number): void {
    this.event('thread_rolled_back', { num_turns: turns });
  }
}
