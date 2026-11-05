import { CHAT_PROGRAMS, type ChatProgram } from '../model/types';
import type { ProgramDefinition } from './definition';

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
