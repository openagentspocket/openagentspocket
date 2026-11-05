// Which conversation an Agent's herdr session record names (Swift ConversationReference). herdr
// reports `agent_session` through the program's hooks; Chat binds by the exact source/agent pair of
// a program and validates the value before it becomes a path or a query argument.

import type { AgentSessionInfo } from '../../protocol/herdr-types.generated';
import type { ProgramDefinition } from '../programs/definition';
import { programDefinitions } from '../programs/registry';
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

interface SessionNaming {
  program: ChatProgram;
  source: string;
  agent: string;
  sessionID: (value: string) => string | null;
  acceptsTranscriptPath: boolean;
}

/** A session counts when herdr's source and agent both name the program. */
function namingOf(definition: ProgramDefinition): SessionNaming {
  const { program, sessionID, acceptsTranscriptPath = false } = definition;
  return { program, source: `herdr:${program}`, agent: program, sessionID, acceptsTranscriptPath };
}

export function resolveConversation(
  session: AgentSessionInfo | null | undefined,
): ConversationResolution {
  if (!session) return { type: 'noSession' };
  const match = programDefinitions()
    .map(namingOf)
    .find((n) => n.source === session.source && n.agent === session.agent);
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
