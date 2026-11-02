import { message, type Text } from '../errors/text';
import type { ChatNotice, ChatToolActivity } from './model/types';

/**
 * Localizable titles for chat rows. The engines write English at reduce time (the Swift reducers
 * wrote the app's language with `String(localized:)`); these functions map those strings back to
 * catalog keys so the UI renders them in the user's language. Keys are the Swift catalog keys
 * verbatim. Anything that is not a known title (a command, a model's own summary, a path) comes
 * back as a plain string and is never translated.
 */

const NOTICE_FIXED: Partial<Record<ChatNotice['kind'], readonly string[]>> = {
  interrupted: ['Interrupted'],
  stopped: ['All background agents stopped', 'Stopped (budget)', 'Stopped'],
  error: ['Turn failed'],
  modelChange: ['Switched model'],
  planMode: ['Entered plan mode'],
  hook: ['Hook'],
  answered: ['Answered'],
  taskNotification: ['Background task finished'],
  system: ['Teammate finished', 'Message'],
};

export function noticeTitleText(notice: Pick<ChatNotice, 'kind' | 'title'>): Text {
  const { kind, title } = notice;
  if (NOTICE_FIXED[kind]?.includes(title)) return message(title);
  if (kind === 'modelChange') {
    const pair = /^Switched from (.+?) to (.+)$/s.exec(title);
    if (pair) return message('Switched from %@ to %@', pair[1] as string, pair[2] as string);
    const to = /^Switched to (.+)$/s.exec(title);
    if (to) return message('Switched to %@', to[1] as string);
  }
  if (kind === 'taskNotification') {
    const status = /^Background task (\S+)$/.exec(title);
    if (status) return message('Background task %@', status[1] as string);
  }
  if (kind === 'system') {
    const finished = /^Teammate @(.+) finished$/s.exec(title);
    if (finished) return message('Teammate @%@ finished', finished[1] as string);
    const from = /^Message from @(.+)$/s.exec(title);
    if (from) return message('Message from @%@', from[1] as string);
  }
  return title;
}

const TOOL_FIXED: Partial<Record<ChatToolActivity['kind'], readonly string[]>> = {
  todo: ['Update todos', 'Update plan'],
  agent: ['Workflow', 'Subagent'],
  question: ['Question'],
  other: ['Enter plan mode', 'Exit plan mode'],
};

export function toolTitleText(tool: Pick<ChatToolActivity, 'kind' | 'name' | 'title'>): Text {
  const { kind, name, title } = tool;
  if (TOOL_FIXED[kind]?.includes(title)) return message(title);
  if (name === 'ToolSearch') {
    const loaded = /^Loaded (.+)$/s.exec(title);
    if (loaded) return message('Loaded %@', loaded[1] as string);
    const searched = /^Searched tools for (.+)$/s.exec(title);
    if (searched) return message('Searched tools for %@', searched[1] as string);
  }
  if (name === 'TaskUpdate') {
    const status = /^Task #(\S+): (.+)$/s.exec(title);
    if (status) return message('Task #%@: %@', status[1] as string, status[2] as string);
    const updated = /^Updated task #(\S+)$/.exec(title);
    if (updated) return message('Updated task #%@', updated[1] as string);
  }
  return title;
}

export function toolSubtitleText(tool: Pick<ChatToolActivity, 'kind' | 'subtitle'>): Text | null {
  const { kind, subtitle } = tool;
  if (subtitle === null) return null;
  const teammate = kind === 'agent' ? /^Teammate @(.+)$/s.exec(subtitle) : null;
  return teammate ? message('Teammate @%@', teammate[1] as string) : subtitle;
}

/** The note a tool row carries when its question closed unanswered. */
export function toolNoteText(note: string | null): Text | null {
  if (note === null) return null;
  return note === 'Question closed' ? message(note) : note;
}
