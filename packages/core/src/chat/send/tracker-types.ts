// What the send tracker keeps and what it asks of its owner (Swift AgentChatStore's send state:
// TrackedSend, WitnessState, the sets and clocks `matchSends` and the checks read).

import type { AnsiScreen } from '../../blocked/screen';
import type { Clock } from '../../hosts/cancellation';
import type { ChatPhase } from '../engine/snapshot';
import type { ChatHostFiles } from '../model/host-files';
import type { ChatAgentActivity, ChatTranscript } from '../model/types';
import type { SendStatus } from './echoes';
import type { ProgramSendPolicy } from './policy';
import type { SendWitnessMark } from './send-witness';

/** Milliseconds; the Swift timing in seconds. */
export interface SendTiming {
  /** How long after delivery a sent prompt may stay unrecorded before its echo says so, on the echo clock. */
  readonly echoTimeoutMs: number;
  /** How long after delivery the program's prompt log is first read for a send delivered while idle. */
  readonly witnessFirstReadMs: number;
  /** How long the log's size, a send's mark, may take to read. */
  readonly witnessMarkTimeoutMs: number;
  readonly witnessReadTimeoutMs: number;
  /** How long a program that hands steers back stays idle before the input box is read for them. */
  readonly returnCheckDelayMs: number;
}

export const DEFAULT_SEND_TIMING: SendTiming = {
  echoTimeoutMs: 10_000,
  witnessFirstReadMs: 2000,
  witnessMarkTimeoutMs: 1000,
  witnessReadTimeoutMs: 3000,
  returnCheckDelayMs: 1000,
};

/** What the tracker reads of the conversation Chat shows. */
export interface TrackedConversation {
  readonly transcript: ChatTranscript;
  readonly readOffset: number;
  readonly layoutGeneration: number;
  readonly phase: ChatPhase;
}

/** What the owner (the conversation store) gives the tracker. */
export interface SendTrackerHost {
  readonly policy: ProgramSendPolicy;
  readonly clock: Clock;
  readonly files: ChatHostFiles;
  readonly timing?: Partial<SendTiming>;
  /** Epoch milliseconds. */
  readonly now: () => number;
  /** What a sent prompt and a recorded one are compared on (the adapter's `echoKey`). */
  readonly echoKey: (text: string) => string;
  readonly conversation: () => TrackedConversation;
  /** Bumped when Chat starts following another conversation. */
  readonly generation: () => number;
  /** What herdr reports the Agent doing. */
  readonly activity: () => ChatAgentActivity;
  /** The session Chat follows, null while none. */
  readonly followedSessionID: () => string | null;
  /** The Agent's screen through `agent.read`. */
  readonly readScreen: () => Promise<AnsiScreen>;
  /** A prompt was just sent: the Agent is about to write, and may start a session Chat has not seen. */
  readonly sent: () => void;
  /** A send went overdue: the program may have forked into a session herdr has not reported yet. */
  readonly overdue: () => void;
  /** Looks at the Agent's record again now. */
  readonly refreshAgent: () => void;
  /** Statuses changed. */
  readonly changed: () => void;
}

export interface TrackedSend {
  readonly id: string;
  readonly key: string;
  /** What herdr typed, looked for in the input box. */
  readonly text: string;
  /** The conversation it went into, how its file was laid out, and how far it had been read. */
  readonly generation: number;
  readonly layout: number;
  readonly floor: number;
  /** The entries showing when it was sent, none of which can record it, wherever a rewrite moves them. */
  readonly knownEntries: ReadonlySet<string>;
  /** First seen already delivered, so its floor is unknown. */
  readonly isOrphan: boolean;
  deliveredAt: number | null;
}

export type WitnessMarkState =
  | { readonly kind: 'taking' }
  | { readonly kind: 'taken'; readonly mark: SendWitnessMark }
  | { readonly kind: 'sealed'; readonly mark: SendWitnessMark }
  | { readonly kind: 'unavailable' };

/** Where a send's witness stands: its mark, and which of its reads have run. */
export interface WitnessState {
  mark: WitnessMarkState;
  /** herdr reported the Agent neither Working nor Blocked when it went. */
  deliveredWhileIdle: boolean;
  firstReadDone: boolean;
  lastReadDone: boolean;
}

/** A send the program's own log says went into another session, which holds every later send. */
export interface SessionConcern {
  readonly reason: string;
  /** The misdirected send. */
  readonly raisedBy: string;
  /** How far the transcript had been read when it was raised. */
  readonly promptFloor: number;
  readonly generation: number;
}

/** Everything the tracker's pieces share. */
export interface TrackerState {
  sends: TrackedSend[];
  statuses: Map<string, SendStatus>;
  returned: Set<string>;
  discarded: Set<string>;
  extended: Set<string>;
  returnChecked: Set<string>;
  refused: Map<string, string>;
  compactChecked: Set<string>;
  compactingSeen: Map<string, number>;
  witnesses: Map<string, WitnessState>;
  witnessMarks: Map<string, Promise<void>>;
  misdirected: Set<string>;
  sessionConcern: SessionConcern | null;
  lastReadStartedAt: number | null;
  idleSince: number | null;
  turnStartedAt: number | null;
  busySince: number | null;
  busySpells: { start: number; end: number }[];
  claimedPrompts: Map<string, number>;
  claimedGeneration: number;
  claimedLayout: number;
}

export function newTrackerState(): TrackerState {
  return {
    sends: [],
    statuses: new Map(),
    returned: new Set(),
    discarded: new Set(),
    extended: new Set(),
    returnChecked: new Set(),
    refused: new Map(),
    compactChecked: new Set(),
    compactingSeen: new Map(),
    witnesses: new Map(),
    witnessMarks: new Map(),
    misdirected: new Set(),
    sessionConcern: null,
    lastReadStartedAt: null,
    idleSince: null,
    turnStartedAt: null,
    busySince: null,
    busySpells: [],
    claimedPrompts: new Map(),
    claimedGeneration: 0,
    claimedLayout: 0,
  };
}

/** The text without its whitespace, which the editor's wrapping changes. */
export const squeezedChars = (text: string): string[] => [...text.replace(/\s/gu, '')];

/**
 * Codex's TUI reads a paste as an image path: a `file://` URL, optionally in one pair of quotes,
 * else a single shell word. Paths compare as written; Agentico sends absolute ones.
 */
export function pastedPath(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  let unquoted = trimmed;
  const first = trimmed[0];
  if (trimmed.length >= 2 && (first === '"' || first === "'") && trimmed.endsWith(first)) {
    unquoted = trimmed.slice(1, -1);
  }
  if (unquoted.startsWith('file://')) {
    // `file://[host]/path`: an empty or local host, a percent-decoded path.
    const rest = unquoted.slice('file://'.length);
    const slash = rest.indexOf('/');
    if (slash < 0) return null;
    const host = rest.slice(0, slash);
    if (host !== '' && host !== 'localhost') return null;
    try {
      return decodeURIComponent(rest.slice(slash));
    } catch {
      return null;
    }
  }
  const words = shellWords(trimmed);
  return words !== null && words.length === 1 ? (words[0] as string) : null;
}

/** POSIX shell words: quotes group, a backslash escapes outside single quotes. Null for an unterminated quote. */
function shellWords(text: string): string[] | null {
  const words: string[] = [];
  let word = '';
  let inWord = false;
  const characters = [...text];
  for (let at = 0; at < characters.length; at += 1) {
    const character = characters[at] as string;
    if (character === "'" || character === '"') {
      inWord = true;
      let closed = false;
      while (at + 1 < characters.length) {
        at += 1;
        const next = characters[at] as string;
        if (next === character) {
          closed = true;
          break;
        }
        if (character === '"' && next === '\\' && at + 1 < characters.length) {
          at += 1;
          const escaped = characters[at] as string;
          if (!'$`"\\\n'.includes(escaped)) word += '\\';
          word += escaped;
        } else {
          word += next;
        }
      }
      if (!closed) return null;
    } else if (character === '\\') {
      inWord = true;
      if (at + 1 < characters.length) {
        at += 1;
        word += characters[at] as string;
      }
    } else if (/\s/u.test(character)) {
      if (inWord) {
        words.push(word);
        word = '';
        inWord = false;
      }
    } else {
      inWord = true;
      word += character;
    }
  }
  if (inWord) words.push(word);
  return words;
}
