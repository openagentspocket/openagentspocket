// The shapes of the conversation store: the Agent record it follows, its pacing, its observable state.

import type { AnsiScreen } from '../../blocked/screen';
import type { Clock } from '../../hosts/cancellation';
import type { AgentSessionInfo } from '../../protocol/herdr-types.generated';
import type { ChatTranscriptCache } from '../model/cache';
import type {
  ConversationReference,
  ConversationResolution,
} from '../model/conversation-reference';
import type { ChatHostFiles } from '../model/host-files';
import type { ChatAgentActivity, ChatProgram } from '../model/types';
import type { ChatWorkflowProgress } from '../model/workflow-progress';
import type { SendStatus } from '../send/echoes';
import type { SendTiming } from '../send/tracker-types';
import type { ChatUnavailableReason } from '../timeline/reasons';
import type { ChatTranscriptAdapter } from './adapter';
import type { ChatExpandedOutput } from './engine';
import type { ChatConversationSnapshot, ChatToolOutputFailure } from './snapshot';

/** The slice of herdr's Agent record Chat follows. */
export interface ChatAgentView {
  program: ChatProgram;
  activity: ChatAgentActivity;
  cwd: string | null;
  foregroundCwd: string | null;
  session: AgentSessionInfo | null;
}

export interface ChatTiming {
  activeIntervalMs: number;
  idleIntervalMs: number;
  /** How long after a change or a status change polling stays at the active interval. */
  activeLingerMs: number;
  /** Waits before looking for a transcript again, one per failed look; the last repeats. */
  locateBackoffMs: number[];
  /** The pause while the Agent reports no session Chat can follow. */
  sessionRecheckMs: number;
}

export const DEFAULT_CHAT_TIMING: ChatTiming = {
  activeIntervalMs: 1000,
  idleIntervalMs: 4000,
  activeLingerMs: 15_000,
  locateBackoffMs: [2000, 4000, 8000, 16_000, 30_000],
  sessionRecheckMs: 5000,
};

export type ChatOutputState =
  | { type: 'loading' }
  | { type: 'loaded'; output: ChatExpandedOutput }
  | { type: 'failed'; failure: ChatToolOutputFailure };

export interface ConversationState {
  snapshot: ChatConversationSnapshot;
  workflowProgress: Readonly<Record<string, ChatWorkflowProgress>>;
  /** Expanded rows' outputs by entry id. */
  outputs: ReadonlyMap<string, ChatOutputState>;
  /** Where each message Chat sent stands against the transcript (absent until one is sent). */
  sendStatuses?: ReadonlyMap<string, SendStatus>;
  /** Bumped on every change, for `useSyncExternalStore`. */
  version: number;
}

export interface ConversationStoreOptions {
  hostId: string;
  /** `""` for the default herdr session, `name:<n>` or `path:<p>` otherwise. */
  herdrSession: string;
  /** The Agent as the Console last reported it; undefined once it is gone. */
  agent: () => ChatAgentView | undefined;
  files: ChatHostFiles;
  cache: ChatTranscriptCache;
  clock: Clock;
  now?: () => number;
  accountDirectories?: () => Promise<string[]>;
  timing?: Partial<ChatTiming>;
  adapterFor?: (program: ChatProgram) => ChatTranscriptAdapter | null;
  /** The Agent's screen through `agent.read`: Chat's sends are checked against it. */
  readScreen?: () => Promise<AnsiScreen>;
  sendTiming?: Partial<SendTiming>;
}

export const sameReference = (a: ConversationReference | null, b: ConversationReference | null) =>
  a === b || (a !== null && b !== null && a.program === b.program && a.sessionID === b.sessionID);

/** Why Chat shows no conversation when herdr's record does not bind one. */
export function unavailableReason(
  resolution: Exclude<ConversationResolution, { type: 'bound' }>,
  program: ChatProgram,
): ChatUnavailableReason {
  switch (resolution.type) {
    case 'noSession':
      return { kind: 'noSession', program };
    case 'unidentified':
      return { kind: 'unidentifiedSession', program };
    default:
      return { kind: 'unsupportedSession' };
  }
}
