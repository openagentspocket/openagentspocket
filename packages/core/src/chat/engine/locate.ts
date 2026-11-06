// Finds the transcript file of a conversation (the `locate` step of Swift ChatConversationEngine).

import type { CodexRolloutSegment } from '../codex/locator';
import type { ConversationReference } from '../model/conversation-reference';
import type { ChatHostFiles } from '../model/host-files';
import type { ChatAgentActivity } from '../model/types';
import { programDefinition } from '../programs/registry';
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

export function locateTranscript(state: LocateState): Promise<Location> {
  return programDefinition(state.reference.program).locate(state);
}
