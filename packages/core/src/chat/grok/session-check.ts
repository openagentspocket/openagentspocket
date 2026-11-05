// Whether Grok Build's screen, read just before a send, shows the session Chat follows (Swift
// GrokSessionCheck). herdr follows `/new`, `/clear` and a message sent from the dashboard, but keeps
// reporting the old session after `/resume`, `/fork` and going back from the dashboard, and a
// message pasted then lands in a conversation Chat doesn't show. Three readings run in order and
// the first verdict wins: the Welcome screen, a Session line, and the newest message on screen.
// Each says nothing when unsure; the post-send witness catches what they miss.

import type { AnsiScreen } from '../../blocked/screen';
import type { ChatTranscript } from '../model/types';
import type { ScreenSessionVerdict, SessionCheckInput } from '../send/policy';
import { type GrokScreen, type GrokUserRow, readGrokScreen } from './screen';

export const GROK_WELCOME_REASON =
  'Grok Build is on its welcome screen, where a message starts a new session. Go back with Resume session (Ctrl+R) in the terminal, or start the new one there.';
export const GROK_SESSION_LINE_REASON =
  "Grok Build's screen shows another session. If you just ran /new or /clear, Chat follows it in a moment; send again then. Otherwise switch back to this conversation in the terminal first.";
export const GROK_UNKNOWN_PROMPT_REASON =
  "Grok Build's screen shows a message this conversation doesn't have. It may be in another session, or the terminal may be scrolled up. Check the terminal, then send again.";
export const GROK_AGENT_VIEW_REASON =
  'Grok Build is showing an agent from its dashboard, which may not be this conversation. Go back to the conversation in the terminal first.';

const UNKNOWN: ScreenSessionVerdict = { kind: 'unknown' };
const THIS: ScreenSessionVerdict = { kind: 'thisSession' };
const other = (reason: string): ScreenSessionVerdict => ({ kind: 'otherSession', reason });

const squeezed = (text: string): string => [...text].filter((c) => !/\s/u.test(c)).join('');

/** Whether the conversation has a message, read or not (a restored transcript keeps where the newest starts). */
function hasMessages(transcript: ChatTranscript): boolean {
  return (
    transcript.recordedPrompts.length > 0 ||
    transcript.latestPromptOffset !== null ||
    transcript.turns.length > 0 ||
    transcript.needsOlderHistory
  );
}

/** The newest turn opens with a prompt Chat has read. */
function opensWithReadPrompt(transcript: ChatTranscript): boolean {
  const opener = transcript.turns.at(-1)?.firstEntryID;
  return (
    opener !== undefined && transcript.recordedPrompts.some((prompt) => prompt.entryID === opener)
  );
}

/** What a row is compared on: its text without whitespace, and without the `…` Grok ends a cut message with. */
function keyOf(row: GrokUserRow): string {
  return squeezed(row.text.endsWith('…') ? row.text.slice(0, -1) : row.text);
}

/**
 * The bottom-most user row against the transcript, once Chat's reading of it is complete: herdr
 * reports Grok idle and its screen agrees, a poll that started since then has been applied, and the
 * newest turn's opener is loaded, or the conversation has no message at all. A session with no
 * message has none of its own to show, so a typed one is another session's.
 */
function newestMessage(grok: GrokScreen, input: SessionCheckInput): ScreenSessionVerdict {
  const { transcript } = input;
  if (
    input.activity !== 'idle' ||
    grok.statusRow !== null ||
    !input.polledSinceIdle ||
    !(!hasMessages(transcript) || opensWithReadPrompt(transcript))
  ) {
    return UNKNOWN;
  }
  // Never an older row: the terminal may be scrolled up.
  const row = grok.userRows.at(-1);
  // A command, shell mode, or a paste or image chip: the scrollback doesn't show what the transcript records.
  const lead = row === undefined ? undefined : [...row.text][0];
  if (row === undefined || lead === undefined || '/!['.includes(lead)) return UNKNOWN;
  const text = keyOf(row);
  if (text === '' || [...input.unrecordedSendKeys].some((key) => squeezed(key).startsWith(text))) {
    return UNKNOWN;
  }
  const prompts = transcript.recordedPrompts.map((prompt) => squeezed(prompt.text));
  if (prompts.at(-1)?.startsWith(text)) {
    // A send another session took reads the same on its screen.
    const misdirected = [...input.misdirectedSendKeys].some((key) =>
      squeezed(key).startsWith(text),
    );
    return misdirected ? UNKNOWN : THIS;
  }
  return prompts.some((prompt) => prompt.startsWith(text))
    ? UNKNOWN
    : other(GROK_UNKNOWN_PROMPT_REASON);
}

function readings(grok: GrokScreen, input: SessionCheckInput): ScreenSessionVerdict {
  // At Grok's start the session has no prompt yet, and a message from the Welcome screen is its first.
  if (grok.isWelcome && hasMessages(input.transcript)) return other(GROK_WELCOME_REASON);
  // Grok prints the line into the scrollback of the session it names, so the screen shows that
  // session, whatever messages follow the line.
  if (grok.sessionLine !== null && grok.sessionLine.sessionID !== input.sessionID.toLowerCase()) {
    return other(GROK_SESSION_LINE_REASON);
  }
  return newestMessage(grok, input);
}

/**
 * The verdict on `screen` for the session `input` names. Without one, while herdr reports no
 * session Chat follows, only the dashboard's view of an agent holds.
 */
export function grokSessionVerdict(
  screen: AnsiScreen,
  input: SessionCheckInput | null,
): ScreenSessionVerdict {
  const grok = readGrokScreen(screen);
  const verdict = input === null ? UNKNOWN : readings(grok, input);
  if (grok.isDashboardOverlay && verdict.kind !== 'thisSession')
    return other(GROK_AGENT_VIEW_REASON);
  return verdict;
}
