// Shared state and helpers of the Claude entry builder (Swift ClaudeTranscriptProjection.Builder).

import { notice, userMessage } from '../model/factories';
import { capPreview } from '../model/preview';
import type {
  ChatAgentActivity,
  ChatBackgroundWorkAgent,
  ChatBackgroundWorkEnd,
  ChatBackgroundWorkItem,
  ChatBackgroundWorkResume,
  ChatEntry,
  ChatEntryContent,
  ChatPendingRequest,
  ChatTurn,
  ChatTurnEnd,
  NoticeKind,
  TurnEnding,
} from '../model/types';
import { type Answer, answersIn } from './answers';
import type { ClaudeChain, ClaudeRole } from './chain';
import type { ClaudeTranscriptIndex } from './index-store';
import { dateOf } from './prompts';
import { type ClaudeRecord, isAttachment, isSystem, textsOf, toolResultsOf } from './record-types';
import { noticeParts } from './text';
import {
  endOfDelivery,
  isInterruptMarker,
  isTurnBoundary,
  type NotificationDelivery,
  notificationIn,
  notificationKey,
  opensTurn,
} from './turns';
import { type ClaudeUserText, classifyUserText } from './user-text';

interface TurnDraft {
  firstEntryID: string | null;
  startedAt: string | null;
  endedAt: string | null;
  ending: TurnEnding | null;
  failed: boolean;
}

function nonEmpty(text: string | null | undefined): string | null {
  return text === null || text === undefined || text === '' ? null : text;
}

function _commandText(name: string, args: string): string {
  return args === '' ? `/${name}` : `/${name} ${args}`;
}

export abstract class BuilderBase {
  entries: ChatEntry[] = [];
  pendingRequests: ChatPendingRequest[] = [];
  entryByRecord = new Map<string, string>();
  backgroundWork: ChatBackgroundWorkItem[] = [];
  latestPromptOffset: number | null = null;
  precedingTurnEnd: ChatTurnEnd | null = null;

  protected selected = new Map<string, ClaudeRecord>();
  protected children = new Map<string, ClaudeRecord[]>();
  protected answers = new Map<string, Answer>();
  protected callMessages = new Map<string, string>();
  protected turnBoundaries: number[] = [];
  protected turnDrafts: TurnDraft[] = [];
  protected turnOpen = false;
  protected notifications = new Map<string, NotificationDelivery>();
  protected notificationKeys = new Set<string>();
  /** Subagent resumes (`SendMessage` results naming `resumedAgentId`), by agent id, in order. */
  protected resumes = new Map<string, ChatBackgroundWorkResume[]>();
  /** Notifications naming a task but no tool call, by task id, each at its earliest place. */
  protected agentNotifications = new Map<string, Map<string, NotificationDelivery>>();
  private agents: Record<string, ChatBackgroundWorkAgent> | null = null;
  protected agentsKilled: ClaudeRecord[] = [];
  protected planExitPaths = new Map<string, string>();
  protected planWrites = new Map<string, string>();
  protected entryIDs = new Set<string>();
  protected consumed = new Set<string>();
  protected compactionEntry: number | null = null;
  protected readonly indexed: ReadonlyMap<string, ClaudeRecord>;

  constructor(
    protected readonly chain: ClaudeChain,
    index: ClaudeTranscriptIndex,
    protected readonly role: ClaudeRole,
    protected readonly activity: ChatAgentActivity,
    protected readonly transcriptPath: string | null,
  ) {
    this.indexed = index.records;
    for (const record of chain.records) {
      this.selected.set(record.uuid, record);
      const parent = chain.parents.get(record.uuid);
      if (parent !== undefined) {
        const list = this.children.get(parent);
        if (list) list.push(record);
        else this.children.set(parent, [record]);
      }
      for (const answer of answersIn(record)) {
        if (answer.result.toolUseID === '') continue;
        this.answers.set(answer.result.toolUseID, answer);
        this.noteResume(answer.result.toolUseID, record);
      }
      if (record.messageID !== null) {
        for (const block of record.blocks) {
          if (block.type === 'toolUse' && block.use.id !== '')
            this.callMessages.set(block.use.id, record.messageID);
        }
      }
      if (isTurnBoundary(record)) this.turnBoundaries.push(record.byteOffset);
      if (isSystem(record, 'agents_killed')) this.agentsKilled.push(record);
      else if (isAttachment(record, 'plan_mode_exit')) {
        const path = record.attachment?.planFilePath;
        const parentID = chain.parents.get(record.uuid);
        if (path && parentID !== undefined) this.planExitPaths.set(parentID, path);
      }
      const notification = notificationIn(record);
      if (notification) {
        this.noteAgentNotification(notification, record.byteOffset, record.timestamp);
        if (notification.toolUseID !== null) {
          this.notifications.set(notification.toolUseID, {
            notification,
            offset: record.byteOffset,
            timestamp: record.timestamp,
          });
        }
        if (record.kind.type === 'user') this.notificationKeys.add(notificationKey(notification));
      }
    }
    this.markStoppedCalls();
    // Claude Code queues a notification as soon as the work ends and delivers it once the session
    // can take it, which can be minutes into a busy turn.
    for (const operation of index.queueOperations.values()) {
      if (operation.operation !== 'enqueue' || operation.content === null) continue;
      const classified = classifyUserText(operation.content);
      if (classified.type !== 'taskNotification') continue;
      this.noteAgentNotification(classified.notification, operation.offset, operation.timestamp);
      const callID = classified.notification.toolUseID;
      if (callID === null) continue;
      const existing = this.notifications.get(callID);
      if (existing && existing.offset >= operation.offset) continue;
      this.notifications.set(callID, {
        notification: classified.notification,
        offset: operation.offset,
        timestamp: operation.timestamp,
      });
    }
  }

  get backgroundWorkEnds(): Record<string, ChatBackgroundWorkEnd> {
    const ends: Record<string, ChatBackgroundWorkEnd> = {};
    for (const [callID, delivery] of this.notifications) ends[callID] = endOfDelivery(delivery);
    return ends;
  }

  /**
   * Per Subagent id: its latest resume and that run's end (the notification naming the resuming
   * call, else the first notification naming only the agent after it, else a stop-all after it), and
   * its notifications that name only the agent.
   */
  get backgroundWorkAgents(): Record<string, ChatBackgroundWorkAgent> {
    if (this.agents) return this.agents;
    const agents: Record<string, ChatBackgroundWorkAgent> = {};
    const ids = new Set([...this.resumes.keys(), ...this.agentNotifications.keys()]);
    for (const agentID of ids) {
      const notifications = [...(this.agentNotifications.get(agentID)?.values() ?? [])]
        .sort((a, b) => a.offset - b.offset)
        .map(endOfDelivery);
      const resume = this.resumes.get(agentID)?.at(-1) ?? null;
      let resumeEnd: ChatBackgroundWorkEnd | null = null;
      if (resume) {
        const matched = this.notifications.get(resume.callID);
        resumeEnd = matched
          ? endOfDelivery(matched)
          : (notifications.find((end) => end.offset > resume.offset) ??
            this.endStoppingAfter(resume.offset));
      }
      agents[agentID] = { resume, resumeEnd, notifications };
    }
    this.agents = agents;
    return agents;
  }

  /** The first stop-all record after `offset`, which ends work launched above the loaded lines. */
  endStoppingAfter(offset: number): ChatBackgroundWorkEnd | null {
    const killed = this.agentsKilled.find((record) => record.byteOffset > offset);
    return killed
      ? {
          state: 'stopped',
          offset: killed.byteOffset,
          endedAt: dateOf(killed.timestamp),
          usage: null,
        }
      : null;
  }

  get turns(): ChatTurn[] {
    const turns: ChatTurn[] = [];
    for (const draft of this.turnDrafts) {
      if (draft.firstEntryID === null) continue;
      const ending = draft.ending === 'completed' && draft.failed ? 'failed' : draft.ending;
      turns.push({
        firstEntryID: draft.firstEntryID,
        startedAt: draft.startedAt,
        endedAt: draft.endedAt,
        ending,
      });
    }
    return turns;
  }

  /** Prompts waiting in Claude's queue, shown as bubbles while a turn is open. */
  addWaitingPrompts(waiting: { offset: number; text: string }[]): Map<number, string> {
    let opener: number;
    const last = this.turnBoundaries[this.turnBoundaries.length - 1];
    if (this.turnOpen && last !== undefined) opener = last;
    else if (
      this.turnBoundaries.length === 0 &&
      (this.activity === 'working' || this.activity === 'blocked')
    )
      opener = 0;
    else return new Map();
    const added = new Map<number, string>();
    for (const prompt of waiting) {
      if (prompt.offset < opener) continue;
      const id = `queued:${prompt.offset}`;
      if (this.entryIDs.has(id)) continue;
      this.entryIDs.add(id);
      this.entries.push({
        id,
        sourceOffset: prompt.offset,
        content: { type: 'user', value: userMessage(prompt.text, { wasQueued: true }) },
      });
      added.set(prompt.offset, id);
    }
    return added;
  }

  // MARK: Background work

  private noteResume(callID: string, record: ClaudeRecord): void {
    const agentID = nonEmpty(record.toolResult?.result?.resumedAgentID);
    if (this.role !== 'main' || agentID === null) return;
    const resume = { callID, offset: record.byteOffset, resumedAt: dateOf(record.timestamp) };
    const list = this.resumes.get(agentID);
    if (list) list.push(resume);
    else this.resumes.set(agentID, [resume]);
  }

  private noteAgentNotification(
    notification: NotificationDelivery['notification'],
    offset: number,
    timestamp: string | null,
  ): void {
    if (notification.toolUseID !== null || notification.taskID === null) return;
    let byKey = this.agentNotifications.get(notification.taskID);
    if (!byKey) {
      byKey = new Map();
      this.agentNotifications.set(notification.taskID, byKey);
    }
    const key = notificationKey(notification);
    const existing = byKey.get(key);
    if (!existing || offset < existing.offset) byKey.set(key, { notification, offset, timestamp });
  }

  // MARK: Turns

  protected noteTurn(record: ClaudeRecord): void {
    if (opensTurn(record, this.turnOpen)) {
      this.turnDrafts.push({
        firstEntryID: null,
        startedAt: dateOf(record.timestamp),
        endedAt: null,
        ending: null,
        failed: false,
      });
      this.turnOpen = true;
      return;
    }
    let closing: TurnEnding | null = null;
    if (isSystem(record, 'turn_duration')) closing = 'completed';
    else if (
      record.kind.type === 'user' &&
      isInterruptMarker(record) &&
      toolResultsOf(record).length === 0
    )
      closing = 'interrupted';
    if (this.turnDrafts.length === 0) {
      if (
        closing === null ||
        (this.precedingTurnEnd !== null && this.precedingTurnEnd.ending !== 'interrupted')
      )
        return;
      const endedAt = dateOf(record.timestamp) ?? this.precedingTurnEnd?.endedAt ?? null;
      this.precedingTurnEnd = {
        ending: this.precedingTurnEnd?.ending ?? closing,
        endedAt,
        duration: null,
      };
      return;
    }
    const draft = this.turnDrafts[this.turnDrafts.length - 1] as TurnDraft;
    if (this.turnOpen && record.kind.type === 'assistant' && record.blocks.length > 0) {
      // Claude Code retries a failed request; a reply after the error clears it.
      draft.failed = record.isAPIError;
    }
    // Only the `turn_duration` that follows an interrupt closes a turn already closed.
    if (closing === null || !(this.turnOpen || draft.ending === 'interrupted')) return;
    draft.endedAt = dateOf(record.timestamp) ?? draft.endedAt;
    if (draft.ending !== 'interrupted') draft.ending = closing;
    this.turnOpen = false;
  }

  protected turnEnded(offset: number): boolean {
    const last = this.turnBoundaries[this.turnBoundaries.length - 1];
    return last !== undefined && last > offset;
  }

  protected markStoppedCalls(): void {
    const stopped: { offset: number; messageID: string }[] = [];
    for (const record of this.chain.records) {
      if (record.interruptedMessageID !== null && isInterruptMarker(record)) {
        stopped.push({ offset: record.byteOffset, messageID: record.interruptedMessageID });
      }
    }
    if (stopped.length === 0) return;
    for (const [callID, answer] of this.answers) {
      const messageID = this.callMessages.get(callID);
      if (
        messageID !== undefined &&
        stopped.some((s) => s.messageID === messageID && s.offset > answer.record.byteOffset)
      ) {
        answer.stoppedWhileRunning = true;
      }
    }
  }

  // MARK: Helpers

  protected add(rawID: string, record: ClaudeRecord, content: ChatEntryContent): boolean {
    if (this.entryIDs.has(rawID)) return false;
    this.entryIDs.add(rawID);
    this.entries.push({ id: rawID, sourceOffset: record.byteOffset, content });
    const last = this.turnDrafts[this.turnDrafts.length - 1];
    if (this.turnOpen && last && last.firstEntryID === null) last.firstEntryID = rawID;
    if (content.type === 'user')
      this.latestPromptOffset = Math.max(this.latestPromptOffset ?? 0, record.byteOffset);
    if (!this.entryByRecord.has(record.uuid)) this.entryByRecord.set(record.uuid, rawID);
    return true;
  }

  protected addSystemNotice(text: string, record: ClaudeRecord, suffix = ''): void {
    const parts = noticeParts(text);
    if (parts.title === '') return;
    this.add(`notice:${record.uuid}${suffix}`, record, {
      type: 'notice',
      value: notice('system', parts.title, { detail: parts.detail }),
    });
  }

  protected addSystemNotices(messages: string[], record: ClaudeRecord): void {
    messages.forEach((message, position) => {
      this.addSystemNotice(message, record, position === 0 ? '' : `#${position}`);
    });
  }

  protected addOutputNotice(kind: NoticeKind, output: string, record: ClaudeRecord): void {
    const parts = noticeParts(output);
    if (parts.title === '') return;
    this.add(`notice:${record.uuid}`, record, {
      type: 'notice',
      value: notice(kind, parts.title, { detail: parts.detail }),
    });
  }

  /** The first unconsumed child of `record` that `extract` reads as output, and that output capped. */
  protected takeOutput(
    record: ClaudeRecord,
    extract: (text: ClaudeUserText) => string | null,
  ): { text: string; record: ClaudeRecord } | null {
    for (const child of this.children.get(record.uuid) ?? []) {
      if (this.consumed.has(child.uuid)) continue;
      let text: string;
      if (child.kind.type === 'user' && toolResultsOf(child).length === 0)
        text = textsOf(child).join('\n');
      else if (isSystem(child, 'local_command')) text = child.system?.content ?? '';
      else continue;
      const output = extract(classifyUserText(text));
      if (output === null) continue;
      this.consumed.add(child.uuid);
      return { text: capPreview(output).text, record: child };
    }
    return null;
  }
}
