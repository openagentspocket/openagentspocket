// What a send's echo waits on besides the transcript (Swift AgentChatStore+SendWitness): the
// program's prompt log, the input box after a stop, and refused compactions. Each check reads the
// Host or the screen once and settles sends; the owner runs them after every transcript read.

import { detectInputBox } from './detect';
import type { InputBoxState } from './input-box';
import { witnessAppended, witnessMark, witnessVerdict } from './send-witness';
import { echoClock } from './tracker-match';
import {
  type SendTiming,
  type SendTrackerHost,
  squeezedChars,
  type TrackedSend,
  type TrackerState,
} from './tracker-types';

export interface CheckContext {
  readonly state: TrackerState;
  readonly host: SendTrackerHost;
  readonly timing: SendTiming;
  /** Re-matches the sends after a check changed what matching reads. */
  readonly match: () => void;
}

/**
 * Reads the Host for a witness within `timeout`, and never cancels the read: a cancelled SFTP
 * request can leave its reply for the next request on the channel, so a read that outlives its
 * deadline runs on, and its answer is dropped.
 */
export function withinTimeout<T>(
  host: Pick<SendTrackerHost, 'clock'>,
  timeoutMs: number,
  read: () => Promise<T>,
): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      host.clock.clearTimeout(handle);
      resolve(value);
    };
    const handle = host.clock.setTimeout(() => finish(null), timeoutMs);
    read().then(finish, () => finish(null));
  });
}

/**
 * Reads the size of the program's prompt log beside the followed transcript for a send that just
 * showed, alongside the check before it goes and never awaited by it.
 */
export function takeWitnessMark(context: CheckContext, id: string): void {
  const { state, host, timing } = context;
  const witness = host.policy.sendWitness;
  const { phase } = host.conversation();
  if (!witness || phase.type !== 'following') return;
  state.witnesses.set(id, {
    mark: { kind: 'taking' },
    deliveredWhileIdle: false,
    firstReadDone: false,
    lastReadDone: false,
  });
  const { path } = phase;
  state.witnessMarks.set(
    id,
    (async () => {
      const mark = await withinTimeout(host, timing.witnessMarkTimeoutMs, () =>
        witnessMark(witness, path, host.files),
      );
      // The check before the send may have dropped it meanwhile.
      const current = state.witnesses.get(id);
      if (!current || current.mark.kind !== 'taking') return;
      current.mark = mark ? { kind: 'taken', mark } : { kind: 'unavailable' };
    })(),
  );
}

/** A send went: a mark the check before it did not keep is dropped. */
export function witnessDelivery(state: TrackerState, id: string): void {
  const current = state.witnesses.get(id);
  if (!current) return;
  current.deliveredWhileIdle = state.busySince === null;
  if (current.mark.kind !== 'sealed') current.mark = { kind: 'unavailable' };
}

/**
 * Reads what the program's prompt log gained since each unrecorded send's mark: once
 * `witnessFirstRead` after a send delivered while the Agent was idle, which the program submitted
 * at once, and once its echo clock reaches the echo timeout, by when a queued send's turn has run.
 * A log that names one other session for the send makes it misdirected, and holds later sends until
 * the terminal is back in this conversation.
 */
export async function checkSendWitnesses(context: CheckContext): Promise<void> {
  const { state, host, timing } = context;
  const witness = host.policy.sendWitness;
  const sessionID = host.followedSessionID();
  if (!witness || sessionID === null) return;
  const date = host.now();
  const generation = host.generation();
  const due: { send: TrackedSend; mark: { path: string; size: number }; isLast: boolean }[] = [];
  for (const send of state.sends) {
    if (send.generation !== generation || send.deliveredAt === null) continue;
    const current = state.witnesses.get(send.id);
    const status = state.statuses.get(send.id)?.kind;
    if (!current || current.mark.kind !== 'sealed') continue;
    if (status !== 'awaiting' && status !== 'overdue') continue;
    const isFirst =
      !current.firstReadDone &&
      current.deliveredWhileIdle &&
      date - send.deliveredAt >= timing.witnessFirstReadMs;
    const isLast =
      !current.lastReadDone &&
      (status === 'overdue' || echoClock(state, host, send, date) >= timing.echoTimeoutMs);
    if (isFirst || isLast) due.push({ send, mark: current.mark.mark, isLast });
  }
  if (due.length === 0) return;
  for (const { send, mark, isLast } of due) {
    const appended = await withinTimeout(host, timing.witnessReadTimeoutMs, () =>
      witnessAppended(witness, mark, host.files),
    );
    if (generation !== host.generation()) return;
    const current = state.witnesses.get(send.id);
    if (current) {
      current.firstReadDone = true;
      if (isLast) current.lastReadDone = true;
    }
    if (!appended) continue;
    const verdict = witnessVerdict(witness, {
      lines: appended.lines,
      key: send.key,
      sessionID,
      isWholeAppend: appended.isWholeAppend,
      echoKey: host.echoKey,
    });
    if (verdict === 'here') {
      // Later reads would find the same line.
      if (current) current.lastReadDone = true;
    } else if (verdict === 'elsewhere') {
      state.misdirected.add(send.id);
      state.sessionConcern = {
        reason: `Your last message went to another ${host.policy.chatName} session. Switch back to this conversation in the terminal, so its newest message shows there, or send from the terminal; then send again here.`,
        raisedBy: send.id,
        promptFloor: host.conversation().readOffset,
        generation,
      };
    }
  }
  context.match();
}

/** The sends, oldest first, whose texts make up all of `box`, spacing aside; text beyond them makes none certain. */
export function sendsIn(box: string, sends: readonly TrackedSend[]): Set<string> {
  const target = squeezedChars(box);
  const texts = sends.map((send) => squeezedChars(send.text));
  if (target.length === 0) return new Set();
  const dead = new Set<number>();
  // Indices of the sends that spell `target` from `start` on, using only sends from `first` on.
  const spell = (start: number, first: number): number[] | null => {
    if (start === target.length) return [];
    const key = start * (texts.length + 1) + first;
    if (dead.has(key)) return null;
    for (let index = first; index < texts.length; index += 1) {
      const text = texts[index] as string[];
      if (text.length === 0) continue;
      const end = start + text.length;
      if (end > target.length || !text.every((character, at) => character === target[start + at])) {
        continue;
      }
      const rest = spell(end, index + 1);
      if (rest) return [index, ...rest];
    }
    dead.add(key);
    return null;
  };
  const indices = spell(0, 0);
  return new Set((indices ?? []).map((index) => (sends[index] as TrackedSend).id));
}

/** Those of `sends` that show anywhere in `box`, spacing aside. */
export function sendsMentionedIn(box: string, sends: readonly TrackedSend[]): Set<string> {
  const target = squeezedChars(box).join('');
  return new Set(
    sends
      .filter((send) => {
        const text = squeezedChars(send.text).join('');
        return text !== '' && target.includes(text);
      })
      .map((send) => send.id),
  );
}

/**
 * Settles which of `ids` the input box holds. Only an empty box or one showing text says so; any
 * other state leaves them as they were. A returned send the box no longer holds left it
 * undelivered, but text that shows one of them among more says nothing about which left.
 */
export function observeInputBox(
  context: CheckContext,
  inputBox: InputBoxState,
  ids: ReadonlySet<string>,
): void {
  const { state } = context;
  let box: string;
  if (inputBox.kind === 'text') box = inputBox.text;
  else if (inputBox.kind === 'empty') box = '';
  else return;
  const among = state.sends.filter((send) => ids.has(send.id));
  const held = sendsIn(box, among);
  const returned = among.filter((send) => state.returned.has(send.id));
  const mentioned = sendsMentionedIn(box, returned);
  if (held.size === 0 && mentioned.size > 0) {
    for (const id of mentioned) state.extended.add(id);
    return;
  }
  const left = [...state.returned].filter((id) => ids.has(id) && !held.has(id));
  const next = new Set([...state.returned].filter((id) => !ids.has(id)));
  for (const id of held) next.add(id);
  const unchanged =
    next.size === state.returned.size && [...next].every((id) => state.returned.has(id));
  if (unchanged) return;
  state.returned = next;
  for (const id of left) state.discarded.add(id);
  context.match();
}

/**
 * Esc in a program that hands steers back puts the steers its turn had not taken into the input
 * box, and the transcript never records them. Once the Agent has been idle a moment, the screen is
 * read once for the sends from the turn that just ended that are still unrecorded, overdue or not,
 * and for the sends already found there, which the user may have sent or cleared since.
 */
export async function checkReturnedSends(context: CheckContext): Promise<void> {
  const { state, host, timing } = context;
  if (!host.policy.stopReturnsUntakenSends) return;
  const idleSince = state.idleSince;
  if (idleSince === null || host.now() - idleSince < timing.returnCheckDelayMs) return;
  const candidates = state.sends.filter((send) => {
    if (state.returnChecked.has(send.id)) return false;
    const status = state.statuses.get(send.id)?.kind;
    const { deliveredAt } = send;
    const turnStartedAt = state.turnStartedAt;
    switch (status) {
      case 'returned':
        return true;
      case 'overdue':
        return deliveredAt !== null && turnStartedAt !== null && deliveredAt >= turnStartedAt;
      case 'awaiting':
        // A send still in time is read early only when it went in while the turn ran.
        return (
          deliveredAt !== null &&
          turnStartedAt !== null &&
          deliveredAt >= turnStartedAt &&
          deliveredAt <= idleSince
        );
      default:
        return false;
    }
  });
  if (candidates.length === 0) return;
  const ids = new Set(candidates.map((send) => send.id));
  for (const id of ids) state.returnChecked.add(id);
  let screen: Awaited<ReturnType<SendTrackerHost['readScreen']>>;
  try {
    screen = await host.readScreen();
  } catch {
    return;
  }
  if (state.idleSince !== idleSince) return;
  observeInputBox(context, detectInputBox(screen, host.policy), ids);
}

/**
 * A read of the Agent's screen made for another reason, such as the check before a send: a
 * returned send it no longer finds in the input box is discarded. It never finds new ones.
 */
export function inputBoxWasRead(
  context: CheckContext,
  screen: Parameters<typeof detectInputBox>[0],
): void {
  const { state, host } = context;
  if (!host.policy.stopReturnsUntakenSends || state.returned.size === 0) return;
  observeInputBox(context, detectInputBox(screen, host.policy), state.returned);
}

/**
 * A program that declines a `/compact` only on screen shows no record of it, so its echo would stay
 * overdue: the screen is read once for each `/compact` past its echo timeout while herdr reports
 * the Agent idle, and the echo awaits that read. A read that finds the compaction running keeps the
 * echo awaiting and the next step reads again; once it is gone the echo waits the echo timeout from
 * the last read that saw it, for the compaction's record.
 */
export async function checkRefusedCompactions(context: CheckContext): Promise<void> {
  const { state, host, timing } = context;
  const reader = host.policy.compaction;
  if (!reader || host.activity() !== 'idle') return;
  const date = host.now();
  const candidates = state.sends.filter((send) => {
    if (send.key !== '/compact' || state.compactChecked.has(send.id) || send.deliveredAt === null) {
      return false;
    }
    const status = state.statuses.get(send.id)?.kind;
    if (status !== 'awaiting' && status !== 'overdue') return false;
    return state.compactingSeen.has(send.id) || date - send.deliveredAt >= timing.echoTimeoutMs;
  });
  if (candidates.length === 0) return;
  const ids = candidates.map((send) => send.id);
  let screen: Awaited<ReturnType<SendTrackerHost['readScreen']>> | null = null;
  try {
    screen = await host.readScreen();
  } catch {
    screen = null;
  }
  for (const id of ids) state.compactChecked.add(id);
  try {
    if (!screen) return;
    if (screen.rows.some((row) => reader.runningRow(row.text))) {
      for (const id of ids) {
        state.compactChecked.delete(id);
        state.compactingSeen.set(id, host.now());
      }
      return;
    }
    const failure = reader.latestFailure(screen);
    if (!failure) return;
    const refusal = reader.refusalText(failure.text);
    for (const id of ids) state.refused.set(id, refusal);
  } finally {
    context.match();
  }
}
