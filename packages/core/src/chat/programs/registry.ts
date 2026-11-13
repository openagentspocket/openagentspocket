import {
  DEFAULT_MESSAGE_JUMP_PROFILE,
  type MessageJumpProfile,
} from '../../terminal/agent-message-jump';
import { CHAT_PROGRAMS, type ChatProgram } from '../model/types';
import type { ProgramDefinition } from './definition';
import type { ProgramModes } from './modes';
import { COMMON_SHORTCUTS, type ProgramShortcut } from './shortcuts';

let definitions: Readonly<Record<ChatProgram, ProgramDefinition>> | undefined;

/**
 * The table of definitions, given once by `chat/programs`. The engines read it here and import no
 * definition, so a definition can point at any of them without a require cycle.
 */
export function provideProgramDefinitions(
  table: Readonly<Record<ChatProgram, ProgramDefinition>>,
): void {
  definitions = table;
}

/** The one place a Chat program is looked up; every other table derives from it. */
export function programDefinition(program: ChatProgram): ProgramDefinition {
  if (!definitions) throw new Error('Import chat/programs before reading a program definition');
  return definitions[program];
}

export const programDefinitions = (): readonly ProgramDefinition[] =>
  CHAT_PROGRAMS.map(programDefinition);

/** Any Agent can jump: a program Chat does not know gets the default walk. */
export function messageJumpProfile(program: string | null | undefined): MessageJumpProfile {
  const known = CHAT_PROGRAMS.find((name) => name === program);
  return (known && programDefinition(known).messageJump?.()) ?? DEFAULT_MESSAGE_JUMP_PROFILE;
}

/** The definition's whole list: its keys and every command of its menu. */
function programList(program: string | null | undefined): readonly ProgramShortcut[] | undefined {
  const known = CHAT_PROGRAMS.find((name) => name === program);
  return known ? programDefinition(known).shortcuts?.() : undefined;
}

/** The composer's shortcuts for an Agent; a program Chat does not know gets the common keys. */
export function programShortcuts(program: string | null | undefined): readonly ProgramShortcut[] {
  const list = programList(program);
  return list ? list.filter((s) => s.kind === 'keys' || s.shortcut) : COMMON_SHORTCUTS;
}

export type ProgramCommand = Extract<ProgramShortcut, { kind: 'command' }>;

/** Every command of the program's own `/` menu, shortcuts first; none for a program Chat does not know. */
export function programCommands(program: string | null | undefined): readonly ProgramCommand[] {
  return (programList(program) ?? []).flatMap((s) => (s.kind === 'command' ? [s] : []));
}

/** The modes an Agent's screen names; null for a program that draws none, or one Chat does not know. */
export function programModes(program: string | null | undefined): ProgramModes | null {
  const known = CHAT_PROGRAMS.find((name) => name === program);
  return (known && programDefinition(known).modes?.()) || null;
}

/** Whether Chat reads a finished Subagent's transcript for an Agent of `program`. */
export function readsSubagentTranscripts(program: string | null | undefined): boolean {
  const known = CHAT_PROGRAMS.find((name) => name === program);
  return known ? programDefinition(known).readsSubagentTranscripts === true : false;
}
