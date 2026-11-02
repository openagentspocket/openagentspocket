// Why Chat cannot show a conversation (Swift ChatUnavailableReason, ChatSessionStoreProblem,
// ChatLaunchNotice). Each reason has its own explanation; none is an error the user caused.
// Defined here until the conversation engine task lands its own; the shapes match Swift's cases.

import type { ChatProgram } from '../model/types';

export type ChatSessionStoreProblem =
  /** No database where Chat reads it, the path shown with `~` for home. */
  | { kind: 'noStore'; path: string }
  /** The database has no conversation with the reported id; `otherStores` names the store files beside it. */
  | { kind: 'sessionMissing'; otherStores: string[] }
  /** The Host has neither sqlite3 nor a python3 Chat can use. */
  | { kind: 'noReader' }
  | { kind: 'readerTooOld'; version: string }
  /** The database's side files are gone: OpenCode isn't running. */
  | { kind: 'storeClosed' }
  | { kind: 'olderOpenCode' }
  | { kind: 'unsupportedLayout'; detail: string }
  | { kind: 'subagentSession' };

/** Whether the user can fix it on the Host, so Chat offers Retry. */
export function problemIsRetryable(problem: ChatSessionStoreProblem): boolean {
  switch (problem.kind) {
    case 'noStore':
    case 'sessionMissing':
    case 'noReader':
    case 'readerTooOld':
    case 'storeClosed':
      return true;
    default:
      return false;
  }
}

/** Whether the store may answer later without the user doing anything, so Chat looks again by itself. */
export function problemReopensByItself(problem: ChatSessionStoreProblem): boolean {
  return (
    problem.kind === 'noStore' ||
    problem.kind === 'sessionMissing' ||
    problem.kind === 'storeClosed'
  );
}

export type ChatUnavailableReason =
  /** herdr has reported no session ID for the Agent. */
  | { kind: 'noSession'; program: ChatProgram }
  /** The session record names something other than a session id the program's naming accepts. */
  | { kind: 'unidentifiedSession'; program: ChatProgram }
  | { kind: 'unsupportedSession' }
  /** No transcript was found; `searchedAll` is false when the search was cut short. */
  | { kind: 'notFound'; searchedAll: boolean }
  /** The program writes its file only with the first message or reply: a message starts it. */
  | { kind: 'awaitingFirstMessage'; program: ChatProgram }
  | { kind: 'compressed' }
  | { kind: 'mismatched' }
  | { kind: 'unsupportedFormat'; format: string }
  | { kind: 'sessionStore'; program: ChatProgram; problem: ChatSessionStoreProblem }
  /** The program shows its home screen, where the conversation herdr reports is no longer open. */
  | { kind: 'startScreen'; program: ChatProgram };

/** Whether Chat shows the explanation in the conversation's place even over saved messages. */
export const hidesConversation = (reason: ChatUnavailableReason): boolean =>
  reason.kind === 'startScreen';

/** Whether a new conversation's file comes only with the first reply (Pi, Oh My Pi), not the first message. */
export const writesNewConversationWithFirstReply = (program: ChatProgram): boolean =>
  program === 'pi' || program === 'omp';

/** Why Chat may not show the conversation open in the terminal, read from how its program was launched. */
export type ChatLaunchNotice = 'codexSharedServer';

/** `--no-daemon` with non-breaking hyphens, so text that wraps keeps the flag on one line. */
export const UNBROKEN_NO_DAEMON = '‑‑no‑daemon';

/** The program's name in what Chat says about its conversation. */
export function chatName(program: ChatProgram): string {
  switch (program) {
    case 'claude':
      return 'Claude Code';
    case 'codex':
      return 'Codex';
    case 'pi':
      return 'Pi';
    case 'omp':
      return 'Oh My Pi';
    case 'grok':
      return 'Grok Build';
    case 'opencode':
      return 'OpenCode';
  }
}
