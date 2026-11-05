// The tool-call half of the Grok Build projection: each call's records merged into one row, the
// background tasks and subagents that finish them, and the Blocked card's pending requests.

import { notice as makeNotice, toolActivity } from '../model/factories';
import { ProjectionBase } from './projection-base';
import { outputReference } from './projection-support';
import { GrokToolCall } from './tool-call';
import type { GrokTool } from './tool-record';
import type { GrokUpdateRecord, SubagentSpawned, TaskCompleted } from './update-record';

export abstract class ToolProjection extends ProjectionBase {
  /** Each tool call by id, in the order first seen. Its entry holds a placeholder until `finish()` builds the row from every record. */
  protected readonly calls = new Map<string, GrokToolCall>();
  protected readonly callOrder: string[] = [];
  /** The call that started each background task, and each subagent. */
  protected readonly taskCalls = new Map<string, string>();
  protected readonly subagentCalls = new Map<string, string>();

  /** One record of a tool call. The call's row shows from its first record on; `finish()` builds it. */
  protected readTool(record: GrokUpdateRecord, tool: GrokTool, isCall: boolean): void {
    const id = tool.callID;
    let call = this.calls.get(id);
    if (!call) {
      const entryID = `grok:tool:${id}`;
      call = new GrokToolCall(id, entryID, this.turnEnds.length - 1);
      this.calls.set(id, call);
      this.callOrder.push(id);
      this.place(
        {
          type: 'tool',
          value: toolActivity({
            kind: 'other',
            name: '',
            title: '',
            status: 'running',
            callID: id,
          }),
        },
        entryID,
        record.offset,
      );
    }
    call.merge(tool, isCall, outputReference(record), record.isTruncated);
    if (tool.output?.taskID != null) this.taskCalls.set(tool.output.taskID, id);
  }

  /** A background task ended: its call's row says how, and a notice marks when. */
  protected readTaskEnd(record: GrokUpdateRecord, end: TaskCompleted): void {
    if (end.taskID !== null) {
      const callID =
        this.taskCalls.get(end.taskID) ?? (this.calls.has(end.taskID) ? end.taskID : undefined);
      const call = callID === undefined ? undefined : this.calls.get(callID);
      if (call) {
        call.taskEnd = end;
        call.taskEndLine = outputReference(record);
      }
    }
    const detail = end.command === null ? [] : [end.command];
    if (end.wasKilled || end.signal === 'killed') detail.push('Killed');
    else if (end.signal !== null) detail.push(`Signal ${end.signal}`);
    else if (end.exitCode !== null) detail.push(`Exit code ${end.exitCode}`);
    const isCommand = end.taskKind === null || end.taskKind === 'bash';
    this.addNotice(
      makeNotice(
        'taskNotification',
        isCommand ? 'Background command finished' : 'Background task finished',
        { detail: detail.length === 0 ? null : detail.join(' · ') },
      ),
      record,
    );
  }

  /**
   * A subagent started: it belongs to the open spawn call that describes it the same way, else to
   * the first open one. A spawn is open while it is in the latest turn and has neither a subagent
   * nor a result. Grok writes the record before the spawn's result, and can write it before the
   * spawn's input update, so a spawn that failed, or one from an earlier turn, did not start it.
   */
  protected readSpawn(spawned: SubagentSpawned): void {
    const subagentID = spawned.subagentID;
    if (subagentID === null || this.subagentCalls.has(subagentID)) return;
    const turn = this.turnEnds.length - 1;
    const open = this.callOrder.filter((id) => {
      const call = this.calls.get(id);
      return (
        call?.isSpawn === true &&
        call.subagentID === null &&
        call.output === null &&
        call.turn === turn
      );
    });
    const described =
      spawned.description === null
        ? undefined
        : open.find((id) => this.calls.get(id)?.input?.description === spawned.description);
    const callID = described ?? open[0];
    if (callID === undefined) return;
    const call = this.calls.get(callID);
    if (!call) return;
    this.subagentCalls.set(subagentID, callID);
    call.subagentID = subagentID;
    call.subagentType = spawned.subagentType;
    call.subagentDescription = spawned.description;
  }

  /** Builds each call's row in its placeholder's place, and offers a call that waits for approval to the Blocked card. */
  protected resolveTools(): void {
    if (this.callOrder.length === 0) return;
    const positions = new Map<string, number>();
    for (const [index, entry] of this.transcript.entries.entries()) positions.set(entry.id, index);
    for (const id of this.callOrder) {
      const call = this.calls.get(id);
      const index = call === undefined ? undefined : positions.get(call.entryID);
      const entry = index === undefined ? undefined : this.transcript.entries[index];
      if (!call || !entry) continue;
      const turnEnd = this.turnEnds[call.turn] ?? null;
      const tool = call.activity(this.directory, turnEnd, this.activity);
      entry.content = { type: 'tool', value: tool };
      if (tool.status === 'awaitingApproval') {
        this.transcript.pendingRequests.push(call.pendingRequest(tool));
      }
    }
  }
}
