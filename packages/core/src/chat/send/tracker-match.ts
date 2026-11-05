// Matching sends to the prompts the transcript recorded (Swift AgentChatStore.matchSends and the
// echo clock, ADR 0024): first in, first out, one to one, equal keys, and only prompts recorded
// after the send. Conservative on purpose: a wrong match would hide a prompt that never arrived.

import type { SendStatus } from './echoes';
import {
  pastedPath,
  type SendTiming,
  type SendTrackerHost,
  squeezedChars,
  type TrackedSend,
  type TrackerState,
} from './tracker-types';

interface Candidate {
  readonly claim: string;
  readonly offset: number;
  readonly entryID: string | null;
}

interface RecordedPrompt {
  readonly candidate: Candidate;
  readonly key: string;
  readonly text: string;
  readonly imagePaths: readonly string[] | null;
}

/**
 * How long `send` has waited for its record by `date`: the time since delivery or, for a program
 * whose echo clock stops while it works, only the part of it herdr reported the Agent neither
 * Working nor Blocked.
 */
export function echoClock(
  state: TrackerState,
  host: SendTrackerHost,
  send: TrackedSend,
  date: number,
): number {
  if (send.deliveredAt === null) return 0;
  const waited = date - send.deliveredAt;
  if (!host.policy.echoClockStopsWhileWorking) return waited;
  const spells = [...state.busySpells];
  if (state.busySince !== null) spells.push({ start: state.busySince, end: date });
  const from = send.deliveredAt;
  return spells.reduce(
    (clock, spell) => clock - Math.max(0, Math.min(spell.end, date) - Math.max(spell.start, from)),
    waited,
  );
}

/**
 * Whether a `/compact` past its echo timeout still waits, in a program that declines one only on
 * screen: until the screen has been read for it while the Agent is idle, or while the compaction
 * last seen running there is recent.
 */
export function awaitsCompaction(
  state: TrackerState,
  host: SendTrackerHost,
  timing: SendTiming,
  send: TrackedSend,
  date: number,
): boolean {
  if (!host.policy.compaction || send.key !== '/compact') return false;
  const seen = state.compactingSeen.get(send.id);
  if (seen !== undefined) return date - seen < timing.echoTimeoutMs;
  return !state.compactChecked.has(send.id) && host.activity() === 'idle';
}

/** Re-matches every send; returns whether one became overdue. */
export function matchSends(
  state: TrackerState,
  host: SendTrackerHost,
  timing: SendTiming,
): boolean {
  const byEntry = host.policy.echoesByEntry;
  const conversation = host.conversation();
  const layout = conversation.layoutGeneration;
  const generation = host.generation();
  if (state.claimedGeneration !== generation || (!byEntry && state.claimedLayout !== layout)) {
    state.claimedGeneration = generation;
    state.claimedLayout = layout;
    state.claimedPrompts = new Map();
  }
  const candidate = (offset: number, entryID: string | null): Candidate | null => {
    if (!byEntry) return { claim: `@${offset}`, offset, entryID };
    return entryID === null ? null : { claim: entryID, offset, entryID };
  };
  const { transcript } = conversation;
  const recorded: RecordedPrompt[] = [];
  for (const prompt of transcript.recordedPrompts) {
    const found = candidate(prompt.offset, prompt.entryID);
    if (!found) continue;
    recorded.push({
      candidate: found,
      key: host.echoKey(prompt.text),
      text: squeezedChars(prompt.text).join(''),
      imagePaths: prompt.pastedImagePaths,
    });
  }
  // Codex records no prompt for `/compact`, only the compaction.
  const compactions: Candidate[] = [];
  for (const entry of transcript.entries) {
    if (entry.content.type !== 'divider' || entry.content.value.kind !== 'compaction') continue;
    const found = candidate(entry.sourceOffset, entry.id);
    if (found) compactions.push(found);
  }
  const date = host.now();
  // A new conversation of a program that writes its file with the first reply records nothing
  // until it does, however long that takes.
  const isUnwritten =
    conversation.phase.type === 'unavailable' &&
    conversation.phase.reason.kind === 'awaitingFirstMessage' &&
    host.policy.writesNewConversationWithFirstReply;
  const statuses = new Map<string, SendStatus>();
  let becameOverdue = false;
  const matchedLast = new Set([...state.discarded, ...state.misdirected]);
  const ordered = [
    ...state.sends.filter((send) => !matchedLast.has(send.id)),
    ...state.sends.filter((send) => matchedLast.has(send.id)),
  ];
  for (const send of ordered) {
    if (state.statuses.get(send.id)?.kind === 'recorded') {
      statuses.set(send.id, { kind: 'recorded' });
      continue;
    }
    const deliveredAt = send.deliveredAt;
    if (deliveredAt === null) {
      statuses.set(send.id, { kind: 'awaiting' });
      continue;
    }
    if (send.isOrphan) {
      statuses.set(send.id, { kind: 'abandoned' });
      continue;
    }
    const isSameConversation = send.generation === generation;
    const floor = isSameConversation && send.layout === layout ? send.floor : 0;
    const isAfter = (found: Candidate): boolean => {
      if (found.offset < floor) return false;
      if (!isSameConversation || found.entryID === null) return true;
      return !send.knownEntries.has(found.entryID);
    };
    const isOpen = (found: Candidate): boolean =>
      isAfter(found) && !state.claimedPrompts.has(found.claim);
    // A prompt that a send from before this one took is that send's late record, not a message after it.
    const isOvertaken = (): boolean =>
      recorded.some((prompt) => {
        if (!isAfter(prompt.candidate)) return false;
        const claimedAt = state.claimedPrompts.get(prompt.candidate.claim);
        return claimedAt === undefined || claimedAt > deliveredAt;
      });
    let match = recorded.find((p) => p.key === send.key && isOpen(p.candidate))?.candidate ?? null;
    // A compaction recorded after a prompt recorded since the send is a later `/compact`'s.
    if (match === null && send.key === '/compact') {
      match =
        compactions.find(
          (compaction) =>
            isOpen(compaction) &&
            !recorded.some((p) => isAfter(p.candidate) && p.candidate.offset < compaction.offset),
        ) ?? null;
    }
    // A path pasted alone becomes `[Image #N]` plus the image, which may name the path only as the
    // program read it, or not at all.
    if (match === null) {
      const path = pastedPath(send.text);
      if (path !== null) {
        match =
          recorded.find((p) => {
            if (p.imagePaths === null || !isOpen(p.candidate)) return false;
            return p.imagePaths.length === 0 || p.imagePaths.includes(path);
          })?.candidate ?? null;
      }
    }
    if (match === null && state.extended.has(send.id)) {
      const text = squeezedChars(send.text).join('');
      match =
        recorded.find((p) => text !== '' && p.text.includes(text) && isOpen(p.candidate))
          ?.candidate ?? null;
    }
    const refusal = state.refused.get(send.id);
    let status: SendStatus;
    if (match) {
      state.claimedPrompts.set(match.claim, deliveredAt);
      status = { kind: 'recorded' };
    } else if (state.misdirected.has(send.id)) {
      status =
        isSameConversation && !isOvertaken() ? { kind: 'misdirected' } : { kind: 'abandoned' };
    } else if (state.returned.has(send.id) && isSameConversation) {
      status = { kind: 'returned' };
    } else if (state.discarded.has(send.id) && isSameConversation) {
      status = isOvertaken() ? { kind: 'abandoned' } : { kind: 'discarded' };
    } else if (state.returned.has(send.id) || state.discarded.has(send.id)) {
      // Put back or cleared in an earlier conversation: the new one, still unwritten, is not waiting for it.
      status = { kind: 'abandoned' };
    } else if (refusal !== undefined) {
      status =
        isSameConversation && !isOvertaken()
          ? { kind: 'refused', reason: refusal }
          : { kind: 'abandoned' };
    } else if (
      send.key === '/compact' &&
      host.policy.recordsCompactionBeforeNextPrompt &&
      isOvertaken()
    ) {
      // The program records a compaction before the next prompt, and a refused one nowhere: with a
      // prompt after it and no compaction, it never ran, whatever the screen read found.
      status = { kind: 'abandoned' };
    } else if (
      isUnwritten ||
      echoClock(state, host, send, date) < timing.echoTimeoutMs ||
      awaitsCompaction(state, host, timing, send, date)
    ) {
      status = { kind: 'awaiting' };
    } else if (isSameConversation) {
      status = { kind: 'overdue' };
      becameOverdue = becameOverdue || state.statuses.get(send.id)?.kind !== 'overdue';
    } else {
      status = { kind: 'abandoned' };
    }
    statuses.set(send.id, status);
  }
  state.statuses = statuses;
  // The send that raised the concern was recorded here after all.
  const concern = state.sessionConcern;
  if (concern && statuses.get(concern.raisedBy)?.kind === 'recorded') state.sessionConcern = null;
  // Only an awaiting send's clock still decides anything, so spells that ended before the oldest
  // one was delivered go. Dropping spells only moves a clock on, past a timeout it already reached.
  const awaiting = state.sends
    .filter((send) => statuses.get(send.id)?.kind === 'awaiting' && send.deliveredAt !== null)
    .map((send) => send.deliveredAt as number);
  const oldestAwaiting = awaiting.length === 0 ? null : Math.min(...awaiting);
  state.busySpells = state.busySpells.filter(
    (spell) => oldestAwaiting !== null && spell.end > oldestAwaiting,
  );
  return becameOverdue;
}
