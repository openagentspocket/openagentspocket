// A Workflow's journal folded into its agents (Swift ClaudeWorkflowJournal), Claude Code 2.1.29x:
// `launched`, then `started {key, agentId, label, phase}` as each agent starts, and
// `result {key, agentId, result}` or `failed {key, agentId}` as it ends. Every line starts with its
// `type`, so a result line cut to its first kilobyte still reads.
//
// Agents are keyed by `key`: a key started again is the same agent, run again, and its newest start
// wins. A running Workflow can start more agents, so the count so far is a lower bound.

import { decodeUtf8 } from '../../events/utf8';
import { repairedJsonPrefix } from '../model/json-prefix';
import { type ChatLine, isTruncatedLine } from '../model/lines';
import { asObject, asString } from '../model/reducer';
import type {
  ChatWorkflowAgent,
  ChatWorkflowProgress,
  WorkflowAgentState,
} from '../model/workflow-progress';

const STATES: Record<string, WorkflowAgentState> = {
  started: 'running',
  result: 'done',
  failed: 'failed',
};

export class ClaudeWorkflowJournal {
  private readonly list: ChatWorkflowAgent[] = [];
  private readonly positions = new Map<string, number>();
  /** Lines that held no event this fold reads. */
  unreadableLines = 0;

  get agents(): readonly ChatWorkflowAgent[] {
    return this.list;
  }

  apply(lines: readonly ChatLine[]): void {
    for (const line of lines) this.applyLine(line);
  }

  private applyLine(line: ChatLine): void {
    const data = isTruncatedLine(line) ? repairedJsonPrefix(line.data) : line.data;
    let event: ReturnType<typeof asObject> = null;
    if (data) {
      try {
        event = asObject(JSON.parse(decodeUtf8(data)));
      } catch {
        event = null;
      }
    }
    const type = event ? asString(event.type) : null;
    if (!event || type === null) {
      this.unreadableLines += 1;
      return;
    }
    // `launched`, and events this fold does not know.
    const state = STATES[type];
    if (state === undefined) return;
    const key = asString(event.key);
    if (!key) {
      this.unreadableLines += 1;
      return;
    }
    const label = asString(event.label);
    const phase = asString(event.phase);
    const position = this.positions.get(key);
    if (position === undefined) {
      this.positions.set(key, this.list.length);
      this.list.push({ id: key, label, phase, state });
      return;
    }
    const agent = this.list[position] as ChatWorkflowAgent;
    agent.state = state;
    if (label !== null) agent.label = label;
    if (phase !== null) agent.phase = phase;
  }

  progress(updatedAt: string | null): ChatWorkflowProgress {
    return { agents: this.list.map((agent) => ({ ...agent })), updatedAt };
  }
}
