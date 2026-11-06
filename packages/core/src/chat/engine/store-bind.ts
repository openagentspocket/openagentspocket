// Which conversation herdr's record binds an Agent to, and why Chat shows none (the bind step of
// Swift AgentChatStore): the reference to follow, or the reason there is nothing to follow.

import { type ConversationReference, resolveConversation } from '../model/conversation-reference';
import type { ChatProgram } from '../model/types';
import type { ChatUnavailableReason } from '../timeline/reasons';
import type { ChatTranscriptAdapter } from './adapter';
import { type ChatConversationSnapshot, initialSnapshot } from './snapshot';
import { type ChatAgentView, sameReference, unavailableReason } from './store-types';

export interface Binding {
  /** The conversation herdr reports. */
  boundTo: ConversationReference | null;
  /** A continuation the program moved the conversation to, while the report still names the old one. */
  continued: ConversationReference | null;
  /** What to follow; null with a `reason` when there is nothing. */
  target: ConversationReference | null;
  reason: ChatUnavailableReason | null;
}

export function bindTarget(
  view: ChatAgentView | undefined,
  adapterFor: (program: ChatProgram) => ChatTranscriptAdapter | null,
  boundTo: ConversationReference | null,
  continued: ConversationReference | null,
  /** The conversation the program left for its home screen: a report of it reads as none. */
  stale: ConversationReference | null = null,
): Binding {
  if (view?.program === null) {
    return { boundTo: null, continued, target: null, reason: { kind: 'unreadableProgram' } };
  }
  const resolution = resolveConversation(view?.session);
  const program = view?.program ?? 'claude';
  const staleReport = resolution.type === 'bound' && sameReference(resolution.reference, stale);
  if (resolution.type !== 'bound' || staleReport) {
    return {
      boundTo: null,
      continued,
      target: null,
      reason:
        stale && (staleReport || resolution.type === 'noSession')
          ? { kind: 'startScreen', program }
          : unavailableReason(resolution as Exclude<typeof resolution, { type: 'bound' }>, program),
    };
  }
  const reported = resolution.reference;
  const kept = sameReference(reported, boundTo) ? continued : null;
  if (!adapterFor(reported.program) || reported.program !== program) {
    return {
      boundTo: reported,
      continued: kept,
      target: null,
      reason: { kind: 'unsupportedSession' },
    };
  }
  return { boundTo: reported, continued: kept, target: kept ?? reported, reason: null };
}

/** The reference of the session a program continued a conversation in; null when the id does not name one. */
export function continuationOf(
  followed: ConversationReference | null,
  sessionID: string,
): ConversationReference | null {
  if (!followed) return null;
  const resolved = resolveConversation({
    source: `herdr:${followed.program}`,
    agent: followed.program,
    kind: 'id',
    value: sessionID,
  });
  return resolved.type === 'bound' ? resolved.reference : null;
}

/** The snapshot that shows why there is no conversation, or null when it already shows exactly that. */
export function unavailableSnapshot(
  current: ChatConversationSnapshot,
  reason: ChatUnavailableReason,
): ChatConversationSnapshot | null {
  const next: ChatConversationSnapshot = {
    ...initialSnapshot(),
    phase: { type: 'unavailable', reason },
  };
  const same =
    JSON.stringify(current.phase) === JSON.stringify(next.phase) &&
    current.transcript.entries.length === 0;
  return same ? null : next;
}
