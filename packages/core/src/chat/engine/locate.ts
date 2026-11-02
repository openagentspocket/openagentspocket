// Finds the transcript file of a conversation (the `locate` step of Swift ChatConversationEngine).

import { ClaudeTranscriptLocator } from '../claude/locator';
import { type CodexRolloutSegment, CodexTranscriptLocator, liveSegment } from '../codex/locator';
import type { ConversationReference } from '../model/conversation-reference';
import type { ChatHostFiles } from '../model/host-files';
import type { ChatAgentActivity } from '../model/types';
import type { ChatUnavailableReason } from '../timeline/reasons';

export interface LocateState {
  reference: ConversationReference;
  files: ChatHostFiles;
  now: () => number;
  /** Where the Agent runs and was launched, most current first. */
  directories: string[];
  relocatedDirectory: string | null;
  /** A message delivered to the Agent went unrecorded past its echo timeout. */
  lostAMessage: boolean;
  /** The engine already shows "awaiting the first message" for Claude. */
  awaitingFirstMessage: boolean;
  activity: ChatAgentActivity;
  /** What herdr reported when a search of every project directory last looked for the new file. */
  newConversationActivity: ChatAgentActivity | null;
  accountDirectories: string[];
  /** A transcript was followed, or entries were restored: one missing now has gone, not yet to come. */
  hasHistory: boolean;
}

export type Location =
  | {
      type: 'found';
      path: string;
      /** The thread's rollout files, oldest first (Codex history bases live among them). */
      segments: CodexRolloutSegment[];
      newConversationActivity: ChatAgentActivity | null;
    }
  | {
      type: 'unavailable';
      reason: ChatUnavailableReason;
      newConversationActivity: ChatAgentActivity | null;
    };

export async function locateTranscript(state: LocateState): Promise<Location> {
  const { reference } = state;
  let remembered = state.newConversationActivity;
  const unavailable = (reason: ChatUnavailableReason): Location => ({
    type: 'unavailable',
    reason,
    newConversationActivity: remembered,
  });
  switch (reference.program) {
    case 'claude': {
      const candidates = [...state.directories];
      if (state.relocatedDirectory !== null) {
        const at = candidates.indexOf(state.relocatedDirectory);
        if (at >= 0) candidates.splice(at, 1);
        candidates.unshift(state.relocatedDirectory);
      }
      const isNew = !state.lostAMessage && state.awaitingFirstMessage;
      const searchesEveryProject = !isNew || state.activity !== remembered;
      // Once per activity, so a search that fails is not repeated every pass.
      if (isNew && searchesEveryProject) remembered = state.activity;
      const result = await new ClaudeTranscriptLocator(state.files).locate({
        sessionID: reference.sessionID,
        directories: candidates,
        searchesEveryProject,
        accountDirectories: state.accountDirectories,
      });
      if (result.ok) {
        return {
          type: 'found',
          path: result.location.transcriptPath,
          segments: [],
          newConversationActivity: remembered,
        };
      }
      const why = result.reason;
      if (why.type === 'notFound') {
        return unavailable(
          searchesEveryProject
            ? { kind: 'notFound', searchedAll: why.searchedAll }
            : { kind: 'awaitingFirstMessage', program: 'claude' },
        );
      }
      if (why.type === 'mismatched') return unavailable({ kind: 'mismatched' });
      // notWritten: a file shown before, or saved on the device, that is gone is not a new conversation.
      if (state.hasHistory || state.lostAMessage) {
        return unavailable({ kind: 'notFound', searchedAll: true });
      }
      remembered = state.activity;
      return unavailable({ kind: 'awaitingFirstMessage', program: 'claude' });
    }
    case 'codex': {
      const result = await new CodexTranscriptLocator(state.files, state.now).locate(
        reference.sessionID,
      );
      if (!result.ok) {
        return unavailable(
          result.reason === 'notFound'
            ? { kind: 'notFound', searchedAll: true }
            : { kind: result.reason },
        );
      }
      const live = liveSegment(result.location);
      if (!live) return unavailable({ kind: 'notFound', searchedAll: true });
      return {
        type: 'found',
        path: live.path,
        segments: result.location.segments,
        newConversationActivity: remembered,
      };
    }
    default:
      // Pi, Oh My Pi, Grok and OpenCode have no engine yet.
      return unavailable({ kind: 'unsupportedSession' });
  }
}
