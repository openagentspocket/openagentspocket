// The echo-status machine of Chat's Composer messages (Swift AgentChatStore+Sends and
// +SendWitness, ADR 0024): each message Chat sends is followed from the moment it shows until the
// transcript records it, with what the program's own log, its screen and the Agent's status say in
// between. Pure over a `SendTrackerHost`; the conversation store owns one per followed Agent.

import type { AnsiScreen } from '../../blocked/screen';
import type { ChatAgentActivity } from '../model/types';
import type { SendStatus, SentMessage } from './echoes';
import type { SessionCheckInput } from './policy';
import {
  type CheckContext,
  checkRefusedCompactions,
  checkReturnedSends,
  checkSendWitnesses,
  inputBoxWasRead,
  takeWitnessMark,
  witnessDelivery,
} from './tracker-checks';
import { matchSends } from './tracker-match';
import {
  DEFAULT_SEND_TIMING,
  newTrackerState,
  type SendTiming,
  type SendTrackerHost,
  type TrackerState,
} from './tracker-types';

const sameStatuses = (a: ReadonlyMap<string, SendStatus>, b: ReadonlyMap<string, SendStatus>) => {
  if (a.size !== b.size) return false;
  for (const [id, status] of a) {
    const other = b.get(id);
    if (!other || JSON.stringify(other) !== JSON.stringify(status)) return false;
  }
  return true;
};

export class SendTracker {
  private readonly state: TrackerState = newTrackerState();
  private readonly timing: SendTiming;

  constructor(private readonly host: SendTrackerHost) {
    this.timing = { ...DEFAULT_SEND_TIMING, ...host.timing };
  }

  /** Where each message stands; read after any call that may change it. */
  get statuses(): ReadonlyMap<string, SendStatus> {
    return this.state.statuses;
  }

  /** Why every later send waits: a send the program's log put in another session. */
  get sessionConcern(): string | null {
    return this.state.sessionConcern?.reason ?? null;
  }

  private get context(): CheckContext {
    return { state: this.state, host: this.host, timing: this.timing, match: () => this.match() };
  }

  /**
   * The messages Chat's Composer holds, oldest first. Each one's place in the transcript is taken
   * when it first appears, before it is sent, so only prompts recorded after that can match it.
   */
  updateSends(messages: readonly SentMessage[]): void {
    const { state, host } = this;
    const ids = new Set(messages.map((message) => message.id));
    state.sends = state.sends.filter((send) => ids.has(send.id));
    const keep = <T>(set: Set<T> & Set<string>) => {
      for (const id of [...set]) if (!ids.has(id)) set.delete(id);
    };
    keep(state.returned);
    keep(state.discarded);
    keep(state.extended);
    keep(state.returnChecked);
    keep(state.compactChecked);
    keep(state.misdirected);
    for (const map of [
      state.refused,
      state.compactingSeen,
      state.witnesses,
      state.witnessMarks,
    ] as Map<string, unknown>[]) {
      for (const id of [...map.keys()]) if (!ids.has(id)) map.delete(id);
    }
    for (const message of messages) {
      const existing = state.sends.find((send) => send.id === message.id);
      if (existing) {
        if (message.isDelivered === (existing.deliveredAt !== null)) continue;
        existing.deliveredAt = message.isDelivered ? host.now() : null;
        if (message.isDelivered) {
          witnessDelivery(state, message.id);
          host.sent();
        }
      } else {
        const conversation = host.conversation();
        const { transcript } = conversation;
        const knownEntries = new Set(transcript.entries.map((entry) => entry.id));
        for (const prompt of transcript.recordedPrompts) {
          if (prompt.entryID !== null) knownEntries.add(prompt.entryID);
        }
        state.sends.push({
          id: message.id,
          key: host.echoKey(message.text),
          text: message.text,
          generation: host.generation(),
          layout: conversation.layoutGeneration,
          floor: conversation.readOffset,
          knownEntries,
          isOrphan: message.isDelivered,
          deliveredAt: message.isDelivered ? host.now() : null,
        });
        if (!message.isDelivered) takeWitnessMark(this.context, message.id);
      }
    }
    this.match();
  }

  /** Re-matches every send against what the transcript records now. */
  match(): void {
    const before = this.state.statuses;
    const overdue = matchSends(this.state, this.host, this.timing);
    if (!sameStatuses(before, this.state.statuses)) this.host.changed();
    if (overdue) this.host.overdue();
  }

  /**
   * Why a send the input box would take waits all the same, from what the box doesn't show: a send
   * the program recorded in another session, or a screen showing another session. Null lets it go,
   * and keeps the witness mark of the newest unsent send of that text if it landed before this.
   * Synchronous: nothing is awaited between the screen read and the paste.
   */
  sendConcern(outgoing: string, screen: AnsiScreen): string | null {
    const { state, host } = this;
    let verdict: ReturnType<NonNullable<typeof host.policy.sessionCheck>> = { kind: 'unknown' };
    const check = host.policy.sessionCheck;
    if (check) verdict = check(screen, this.sessionCheckInput());
    if (verdict.kind === 'thisSession') {
      state.sessionConcern = null;
    } else if (verdict.kind === 'otherSession') {
      // herdr may have adopted the session already (a `/new` since its last idle recheck): asking
      // now rebinds Chat within one step.
      host.refreshAgent();
    }
    if (state.sessionConcern) return state.sessionConcern.reason;
    if (verdict.kind === 'otherSession') return verdict.reason;
    const key = host.echoKey(outgoing);
    const send = [...state.sends]
      .reverse()
      .find((candidate) => candidate.deliveredAt === null && candidate.key === key);
    const witness = send ? state.witnesses.get(send.id) : undefined;
    if (witness) {
      if (witness.mark.kind === 'taken') witness.mark = { kind: 'sealed', mark: witness.mark.mark };
      else if (witness.mark.kind === 'taking') witness.mark = { kind: 'unavailable' };
    }
    return null;
  }

  /** What a session check reads besides the screen, while herdr reports a session Chat follows. */
  private sessionCheckInput(): SessionCheckInput | null {
    const { state, host } = this;
    const sessionID = host.followedSessionID();
    if (sessionID === null) return null;
    const date = host.now();
    const generation = host.generation();
    const unrecorded = state.sends.filter(
      (send) =>
        send.generation === generation &&
        send.deliveredAt !== null &&
        state.statuses.get(send.id)?.kind !== 'recorded',
    );
    const recent = unrecorded.filter(
      (send) => date - (send.deliveredAt as number) < this.timing.echoTimeoutMs,
    );
    const { idleSince, lastReadStartedAt } = state;
    return {
      sessionID,
      transcript: host.conversation().transcript,
      activity: host.activity(),
      polledSinceIdle:
        idleSince !== null && lastReadStartedAt !== null && lastReadStartedAt >= idleSince,
      unrecordedSendKeys: new Set(recent.map((send) => send.key)),
      misdirectedSendKeys: new Set(
        unrecorded.filter((send) => state.misdirected.has(send.id)).map((send) => send.key),
      ),
    };
  }

  // MARK: What the owner tells the tracker

  /**
   * Opens a busy spell when herdr reports the Agent Working or Blocked, and closes it when herdr
   * reports anything else.
   */
  noteActivity(activity: ChatAgentActivity): void {
    const { state } = this;
    const isBusy = activity === 'working' || activity === 'blocked';
    if (isBusy && state.busySince === null) {
      state.busySince = this.host.now();
    } else if (!isBusy && state.busySince !== null) {
      state.busySpells.push({ start: state.busySince, end: this.host.now() });
      state.busySince = null;
    }
  }

  /** herdr reported a status change: `previous` is what it reported before. */
  agentStatusChanged(activity: ChatAgentActivity, previous: ChatAgentActivity): void {
    const { state } = this;
    this.noteActivity(activity);
    state.idleSince = activity === 'idle' ? this.host.now() : null;
    // Answering a dialog resumes the turn it interrupted.
    if (activity === 'working' && previous !== 'working' && previous !== 'blocked') {
      state.turnStartedAt = this.host.now();
    }
    state.returnChecked = new Set();
  }

  /** A transcript read that started at `startedAt` was applied: a session check trusts it once one started after idle. */
  noteReadApplied(startedAt: number): void {
    this.state.lastReadStartedAt = startedAt;
  }

  /** Chat follows another conversation: what was read of the old one says nothing of the new. */
  conversationChanged(): void {
    this.state.lastReadStartedAt = null;
  }

  // MARK: Checks the owner runs after each transcript read

  checkReturnedSends(): Promise<void> {
    return checkReturnedSends(this.context);
  }

  checkRefusedCompactions(): Promise<void> {
    return checkRefusedCompactions(this.context);
  }

  checkSendWitnesses(): Promise<void> {
    return checkSendWitnesses(this.context);
  }

  /** The Agent's screen was read for another reason (the check before a send). */
  inputBoxWasRead(screen: AnsiScreen): void {
    inputBoxWasRead(this.context, screen);
  }

  /** Resolves once every witness mark taken so far has landed or timed out, for tests. */
  async witnessMarksSettled(): Promise<void> {
    await Promise.all([...this.state.witnessMarks.values()]);
  }
}
