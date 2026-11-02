// Which records open or close a turn, and how task notifications read (Swift Builder statics).

import { notice } from '../model/factories';
import { capPreview } from '../model/preview';
import type { BackgroundWorkState, ChatBackgroundWorkEnd, ChatNotice } from '../model/types';
import { dateOf, isHuman, VISIBLE_META_ORIGINS } from './prompts';
import { type ClaudeRecord, isAttachment, isSystem, textsOf, toolResultsOf } from './record-types';
import { type ClaudeTaskNotification, taskNotificationTitle } from './text';
import { classifyUserText, isMarker } from './user-text';

export interface NotificationDelivery {
  notification: ClaudeTaskNotification;
  offset: number;
  timestamp: string | null;
}

export function isInterruptMarker(record: ClaudeRecord): boolean {
  return (
    record.blocks.length > 0 &&
    record.blocks.every((block) => block.type === 'text' && isMarker(block.text.trim()))
  );
}

export function isTurnBoundary(record: ClaudeRecord): boolean {
  if (isSystem(record, 'turn_duration')) return true;
  if (record.kind.type !== 'user') return false;
  if (
    toolResultsOf(record).length > 0 ||
    record.isMeta ||
    record.isCompactSummary ||
    record.sourceToolUseID !== null
  ) {
    return false;
  }
  if (isInterruptMarker(record)) return true;
  const type = classifyUserText(textsOf(record).join('\n')).type;
  return type !== 'hidden' && type !== 'skillLoaded';
}

export function opensTurn(record: ClaudeRecord, whileOpen: boolean): boolean {
  if (isSystem(record, 'local_command')) {
    return !whileOpen && classifyUserText(record.system?.content ?? '').type === 'command';
  }
  if (record.kind.type !== 'user') return false;
  if (
    toolResultsOf(record).length > 0 ||
    record.isCompactSummary ||
    record.sourceToolUseID !== null ||
    isInterruptMarker(record)
  ) {
    return false;
  }
  const type = classifyUserText(textsOf(record).join('\n')).type;
  if (record.isMeta) {
    if (whileOpen || record.originKind === null || !VISIBLE_META_ORIGINS.has(record.originKind))
      return false;
    return type === 'prompt' || type === 'external';
  }
  return ['prompt', 'command', 'bashInput', 'taskNotification', 'external'].includes(type);
}

export function notificationIn(record: ClaudeRecord): ClaudeTaskNotification | null {
  let text: string;
  if (record.kind.type === 'user' && toolResultsOf(record).length === 0 && !record.isMeta) {
    text = textsOf(record).join('\n');
  } else if (isAttachment(record, 'queued_command')) {
    text = record.attachment?.queuedCommand?.text ?? '';
  } else {
    return null;
  }
  const classified = classifyUserText(text);
  return classified.type === 'taskNotification' ? classified.notification : null;
}

export function notificationKey(n: ClaudeTaskNotification): string {
  return [n.taskID, n.toolUseID, n.status, n.summary].map((part) => part ?? '').join('\u001f');
}

export function noticeForNotification(n: ClaudeTaskNotification): ChatNotice {
  const detail = n.result === null ? '' : capPreview(n.result).text;
  return notice('taskNotification', taskNotificationTitle(n), {
    detail: detail === '' ? null : detail,
  });
}

export function workState(n: ClaudeTaskNotification): BackgroundWorkState {
  switch (n.status) {
    case 'failed':
      return 'failed';
    case 'killed':
    case 'stopped':
      return 'stopped';
    case 'blocked':
      return 'running';
    default:
      return 'completed';
  }
}

export function endOfDelivery(delivery: NotificationDelivery): ChatBackgroundWorkEnd {
  return {
    state: workState(delivery.notification),
    offset: delivery.offset,
    endedAt: dateOf(delivery.timestamp),
    usage: delivery.notification.usage,
  };
}

export { isHuman };
