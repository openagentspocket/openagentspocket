// Which conversation an Agent's herdr session record names (Swift ConversationReference). herdr
// reports `agent_session` through the program's hooks; Chat binds by the exact source/agent pair of
// a program and validates the value before it becomes a path or a query argument.

import type { AgentSessionInfo } from '../../protocol/herdr-types.generated';
import { isAcceptablePath } from './paths';
import type { ChatProgram } from './types';

export interface ConversationReference {
  program: ChatProgram;
  /** The program's id, or Pi/OMP's absolute `.jsonl` transcript path. */
  sessionID: string;
}

export type ConversationResolution =
  | { type: 'bound'; reference: ConversationReference }
  /** herdr has no session for the Agent yet. */
  | { type: 'noSession' }
  /** A session from another program, or of a kind Chat cannot read. */
  | { type: 'unsupported' }
  /** The right program, but the value is not an id Chat can look up. */
  | { type: 'unidentified' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OPENCODE_ID = /^ses_[0-9a-f]{12}[0-9a-zA-Z]{14}$/;

interface SessionNaming {
  program: ChatProgram;
  source: string;
  agent: string;
  sessionID: (value: string) => string | null;
  acceptsTranscriptPath: boolean;
}

const canonicalUUID = (value: string) => (UUID.test(value) ? value.toLowerCase() : null);
// Grok names the session folder with the id as given, so another case would name a folder it never wrote.
const lowercaseUUIDv7 = (value: string) => (UUID_V7.test(value) ? value : null);
const openCodeID = (value: string) => (OPENCODE_ID.test(value) ? value : null);

function naming(
  program: ChatProgram,
  sessionID: SessionNaming['sessionID'],
  acceptsTranscriptPath = false,
): SessionNaming {
  return { program, source: `herdr:${program}`, agent: program, sessionID, acceptsTranscriptPath };
}

const NAMINGS: readonly SessionNaming[] = [
  naming('claude', canonicalUUID),
  naming('codex', canonicalUUID),
  naming('pi', canonicalUUID, true),
  naming('omp', canonicalUUID, true),
  naming('grok', lowercaseUUIDv7),
  naming('opencode', openCodeID),
];

export function resolveConversation(
  session: AgentSessionInfo | null | undefined,
): ConversationResolution {
  if (!session) return { type: 'noSession' };
  const match = NAMINGS.find((n) => n.source === session.source && n.agent === session.agent);
  if (!match) return { type: 'unsupported' };
  if (match.acceptsTranscriptPath && session.kind === 'path') {
    if (!isAcceptablePath(session.value) || !session.value.endsWith('.jsonl')) {
      return { type: 'unidentified' };
    }
    return { type: 'bound', reference: { program: match.program, sessionID: session.value } };
  }
  if (session.kind !== 'id') return { type: 'unsupported' };
  const sessionID = match.sessionID(session.value);
  if (sessionID === null) return { type: 'unidentified' };
  return { type: 'bound', reference: { program: match.program, sessionID } };
}
