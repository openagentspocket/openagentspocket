// Constructors with the Swift initializers' defaults, so reducers state only what they know.

import type {
  BackgroundWorkUsage,
  ChatBackgroundWorkItem,
  ChatDivider,
  ChatNotice,
  ChatQuestion,
  ChatToolActivity,
  ChatUserMessage,
} from './types';

export function userMessage(text: string, extra: Partial<ChatUserMessage> = {}): ChatUserMessage {
  return {
    text,
    imageCount: 0,
    attachmentLabels: [],
    command: null,
    wasQueued: false,
    ...extra,
  };
}

export function toolActivity(
  init: Pick<ChatToolActivity, 'kind' | 'name' | 'title' | 'status'> & Partial<ChatToolActivity>,
): ChatToolActivity {
  return {
    subagentActivity: null,
    subagentAgentID: null,
    imagePath: null,
    subtitle: null,
    purpose: null,
    command: null,
    note: null,
    diff: null,
    fileChanges: null,
    exitCode: null,
    questions: [],
    callID: null,
    preview: null,
    output: null,
    cardAnswer: null,
    outputRead: null,
    isNotUpdating: false,
    ...init,
  };
}

export function notice(
  kind: ChatNotice['kind'],
  title: string,
  extra: Partial<ChatNotice> = {},
): ChatNotice {
  return { kind, title, detail: null, rawDetail: null, questions: [], ...extra };
}

export function question(init: Pick<ChatQuestion, 'text'> & Partial<ChatQuestion>): ChatQuestion {
  return {
    id: null,
    header: null,
    options: [],
    isMultiSelect: false,
    recommendedIndex: null,
    answer: null,
    queuedAnswer: null,
    ...init,
  };
}

export function divider(kind: ChatDivider['kind'], detail: string | null = null): ChatDivider {
  return { kind, detail };
}

export function backgroundWorkItem(
  init: Pick<ChatBackgroundWorkItem, 'id' | 'kind' | 'title' | 'launchOffset'> &
    Partial<ChatBackgroundWorkItem>,
): ChatBackgroundWorkItem {
  return {
    subtitle: null,
    state: 'running',
    journalPath: null,
    endOffset: null,
    launchedAt: null,
    endedAt: null,
    usage: null,
    agentID: null,
    resume: null,
    ...init,
  };
}

export function workUsage(partial: Partial<BackgroundWorkUsage> = {}): BackgroundWorkUsage {
  return {
    tokens: null,
    toolUses: null,
    durationMilliseconds: null,
    agents: null,
    agentsDone: null,
    agentsFailed: null,
    ...partial,
  };
}
