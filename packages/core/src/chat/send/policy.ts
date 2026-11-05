// The one per-program send extension point (P2.10b): everything Chat's send side needs to know
// about a program, registered next to its ChatTranscriptAdapter and BlockedProgramSupport. Engines
// built once on top of it (send rules, command menu, pre-send gate, Stop plan, send tracker) never
// name a program; optional capabilities are optional fields, not program checks.

import type { AnsiScreen, ScreenRow } from '../../blocked/screen';
import type { ComposerRefusal } from '../../composer/policy';
import type { AgentStopWait } from '../../composer/stop';
import type { AgentSkill } from '../../skills/agent-skill';
import type { ChatAgentActivity, ChatProgram, ChatTranscript } from '../model/types';
import type { InputBoxState } from './input-box';
import type { SendWitness } from './send-witness';

/** One entry of Chat's `/` menu: a skill the Host offers, or the program's `/compact`. */
export interface ChatCommand {
  readonly name: string;
  readonly summary: string | null;
  /** `compact`, or a skill invoked with `prefix` (`/`, `$`, `/skill:`). */
  readonly kind: { readonly type: 'compact' } | { readonly type: 'skill'; readonly prefix: string };
  /** False when the command needs another state: `/compact` while the Agent works. */
  readonly isEnabled: boolean;
}

/** How Chat sends one menu command to a program's input box. */
export type CommandSubmission =
  /** `/name arguments ` with one trailing space, like any message. */
  | { readonly kind: 'trailingSpace' }
  /** `/name` alone; a draft with arguments is refused with the reason. */
  | { readonly kind: 'bare'; readonly argumentsRefusal: string };

export const TRAILING_SPACE: CommandSubmission = { kind: 'trailingSpace' };

/**
 * What one program's input box reads as more than a message, beyond the shared rules (control
 * bytes, a leading `!`, `/` commands outside the menu), and how it takes each menu command.
 */
export interface SendProfile {
  /** Whole inputs that exit the program, compared trimmed and lowercased. */
  readonly exitWords: ReadonlySet<string>;
  /** The program's own refusal of the draft without its invisible characters, then of that text trimmed. */
  readonly refusal?: (clean: string, trimmed: string) => ComposerRefusal | undefined;
  readonly submission?: (command: ChatCommand) => CommandSubmission;
}

/** What a Stop guard reads: the screen and what herdr reports. */
export interface StopContext {
  readonly screen: AnsiScreen;
  readonly activity: ChatAgentActivity;
}

export type StopVerdict =
  | { readonly kind: 'press' }
  /** Pressing now could quit the program, clear a draft, act on a picker or do nothing; why. */
  | { readonly kind: 'refuse'; readonly reason: string };

/** What Chat's Stop does in one program. */
export interface StopPlanSpec {
  /** herdr key names, sent in one `agent.send_keys`. */
  readonly keys: readonly string[];
  /** Absent presses without reading the screen. */
  readonly screenGuard?: (context: StopContext) => StopVerdict;
  readonly wait: AgentStopWait;
  readonly accessibilityHint: string;
}

/** What a program's session check reads besides the screen. */
export interface SessionCheckInput {
  readonly sessionID: string;
  readonly transcript: ChatTranscript;
  readonly activity: ChatAgentActivity;
  /** A transcript poll that started after herdr last reported idle has been applied. */
  readonly polledSinceIdle: boolean;
  /** Echo keys of Chat's sends delivered in the last echo timeout that the transcript has not recorded yet. */
  readonly unrecordedSendKeys: ReadonlySet<string>;
  /** Echo keys of Chat's sends the prompt log says another session took, however old. */
  readonly misdirectedSendKeys: ReadonlySet<string>;
}

/** What the Agent's screen says about the session it shows. */
export type ScreenSessionVerdict =
  | { readonly kind: 'thisSession' }
  /** The screen shows another session; why, as the hold. */
  | { readonly kind: 'otherSession'; readonly reason: string }
  | { readonly kind: 'unknown' };

/** Which conversation a program's terminal title says its TUI shows. */
export type TerminalTitleVerdict =
  | { readonly kind: 'matches' }
  /** Another conversation, carrying the text the title names. */
  | { readonly kind: 'differs'; readonly title: string }
  | { readonly kind: 'saysNothing' };

/** A program that leaves its conversation without a report and says which one it shows in its title. */
export interface TerminalTitleCheck {
  verdict(terminalTitle: string | null, sessionTitle: string | null): TerminalTitleVerdict;
}

/**
 * A program that declines a `/compact` only on screen (`declinesCompactOnScreen`): how its running
 * compaction and its refusal read.
 */
export interface CompactionScreenReader {
  /** Whether a screen row shows a compaction running. */
  runningRow(text: string): boolean;
  /** The row of the latest refusal sitting just above the input box, if any. */
  latestFailure(screen: AnsiScreen): ScreenRow | null;
  /** What the refusal row says, as the send's refusal. */
  refusalText(failureRowText: string): string;
}

export interface ProgramSendPolicy {
  readonly program: ChatProgram;
  /** The program's name in what Chat says about its conversation. */
  readonly chatName: string;

  // Send rules and the `/` menu
  readonly profile: SendProfile;
  /** Whether Chat offers a skill to this program's menu. */
  offersSkill(skill: AgentSkill): boolean;

  // Echo matching
  /** A recorded prompt keeps its entry when the program rewrites its file: match sends to entries, not offsets. */
  readonly echoesByEntry: boolean;
  /** The echo clock runs only while herdr reports the Agent neither Working nor Blocked. */
  readonly echoClockStopsWhileWorking: boolean;
  /** A new conversation's file comes only with the first reply: a message waits for its record as long as the reply takes. */
  readonly writesNewConversationWithFirstReply: boolean;
  /** An accepted `/compact` is always recorded before the next prompt, so one a later prompt overtook never ran. */
  readonly recordsCompactionBeforeNextPrompt: boolean;
  /** Stop puts the steers its turn had not taken back into the input box, unrecorded. */
  readonly stopReturnsUntakenSends: boolean;
  /** Present when a declined `/compact` shows only on screen. */
  readonly compaction?: CompactionScreenReader;

  // Delivery check
  /** The program can put other text in its box right after taking a message. */
  readonly mayRefillInputBoxAfterSend: boolean;
  /** Reads the input box once the generic dialog check found no dialog. */
  readInputBox(screen: AnsiScreen): InputBoxState;
  /** Names a dialog that holds the box, for the hold's wording (a plan selector): null for none. */
  dialogTitle?(screen: AnsiScreen): string | null;
  /** Why Chat holds a message while the input box reads as `text`. */
  readonly textHoldReason: string;
  /** Replaces the generic dialog hold for a named dialog; undefined keeps the generic one. */
  dialogHoldReason?(title: string | null): string | undefined;

  // Stop
  /** The terminal Composer shows Stop (false where Esc does not interrupt and Send stays). */
  readonly terminalStop: boolean;
  readonly stop: StopPlanSpec;

  // Optional capabilities
  /** Reads the screen for which session it shows, before a send. */
  readonly sessionCheck?: (
    screen: AnsiScreen,
    input: SessionCheckInput | null,
  ) => ScreenSessionVerdict;
  /** The program's own log of the prompts it submits, naming the session that took each. */
  readonly sendWitness?: SendWitness;
  /** The program can leave its conversation without herdr reporting it; its title says which one shows. */
  readonly terminalTitle?: TerminalTitleCheck;
}
