import type { BlockedProgramSupport } from '../../blocked/programs';
import type { Message } from '../../errors/text';
import type { MessageJumpProfile } from '../../terminal/agent-message-jump';
import type { ChatTranscriptAdapter } from '../engine/adapter';
import type { LocateState, Location } from '../engine/locate';
import type { ChatHostFiles } from '../model/host-files';
import type { ChatProgram } from '../model/types';
import type { ProgramSendPolicy } from '../send/policy';
import type { ChatSessionStoreProblem } from '../timeline/reasons';
import type { ProgramModes } from './modes';
import type { ProgramShortcut } from './shortcuts';
import type { TerminalWait } from './terminal-waits';

/**
 * Everything one Chat program contributes. Adding a program is one more name in `CHAT_PROGRAMS` and
 * one definition; the compiler asks for the rest. The parts are functions so that loading the
 * table builds nothing.
 */
export interface ProgramDefinition {
  program: ChatProgram;
  /** The program's name in what Chat says about its conversation. */
  chatName: string;
  /** What Chat says while herdr has reported no session for the Agent. */
  noSessionMessage: () => Message;
  /**
   * What Chat says when the Agent took a prompt and herdr still reports no session: its integration
   * is not reporting. Absent for the common words.
   */
  notReportingMessage?: () => Message;
  /** Screens where the program waits for something only its terminal answers (Codex's hook review). */
  terminalWaits?: () => readonly TerminalWait[];
  /** What the Setup Guide says about this program's herdr integration; absent when nothing. */
  setupNote?: () => Message;
  /** Turns the value herdr reports into the program's session id; null when it is not one. */
  sessionID: (value: string) => string | null;
  /** The session may be named by the absolute path of its `.jsonl` transcript. */
  acceptsTranscriptPath?: boolean;
  /** A rewritten conversation moves to another file, which a poll alone would never follow. */
  movesFileOnRewrite?: boolean;
  /** Null for a program Chat cannot read in this build. */
  adapter: () => ChatTranscriptAdapter | null;
  /** Names the Agent's conversation when herdr reports none; null when it cannot tell. */
  discoverSession?: (
    files: ChatHostFiles,
    directories: readonly string[],
  ) => Promise<string | null>;
  /** Finds the conversation's transcript on the Host. */
  locate: (state: LocateState) => Promise<Location>;
  sendPolicy: () => ProgramSendPolicy;
  /** What Chat says when the program's session store cannot answer; for a program read by query. */
  storeProblem?: (problem: ChatSessionStoreProblem) => Message;
  /** What the Blocked card reads and answers; absent for a program with no dialogs to parse. */
  blocked?: () => BlockedProgramSupport | null;
  /** How Message Jump finds the program's prompts; absent for the default walk. */
  messageJump?: () => MessageJumpProfile;
  /**
   * The program's keys and its whole command menu, from its docs; the shortcuts menu shows the keys
   * and the commands flagged `shortcut`, the `/` panel every command. Absent for the common keys.
   */
  shortcuts?: () => readonly ProgramShortcut[];
  /** The modes its screen names, from its source; absent for a program that draws none. */
  modes?: () => ProgramModes;
  /**
   * A finished Subagent's own transcript can be read and shown; absent where Chat has no reader
   * for it, and its Background Work row then opens nothing.
   */
  readsSubagentTranscripts?: boolean;
}
