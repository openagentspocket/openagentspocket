import type { BlockedProgramSupport } from '../../blocked/programs';
import type { ChatTranscriptAdapter } from '../engine/adapter';
import type { ChatProgram } from '../model/types';
import type { ProgramSendPolicy } from '../send/policy';

/**
 * Everything one Chat program contributes. Adding a program is one more name in `CHAT_PROGRAMS` and
 * one definition; the compiler asks for the rest. The parts are functions so that loading the
 * table builds nothing.
 */
export interface ProgramDefinition {
  program: ChatProgram;
  /** The program's name in what Chat says about its conversation. */
  chatName: string;
  /** Turns the value herdr reports into the program's session id; null when it is not one. */
  sessionID: (value: string) => string | null;
  /** The session may be named by the absolute path of its `.jsonl` transcript. */
  acceptsTranscriptPath?: boolean;
  /** A rewritten conversation moves to another file, which a poll alone would never follow. */
  movesFileOnRewrite?: boolean;
  /** Null for a program Chat cannot read in this build. */
  adapter: () => ChatTranscriptAdapter | null;
  sendPolicy: () => ProgramSendPolicy;
  /** What the Blocked card reads and answers; absent for a program with no dialogs to parse. */
  blocked?: () => BlockedProgramSupport | null;
}
