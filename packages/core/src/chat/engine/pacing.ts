// When the conversation loop reads and how long it waits between turns (the timing rules of Swift
// AgentChatStore): the active pace while the Agent works or just did, the idle pace otherwise, and
// a backoff between searches for a transcript that is not there.

import type { ChatAgentActivity } from '../model/types';
import type { ChatConversationSnapshot } from './snapshot';
import type { ChatTiming } from './store-types';

export class Pacing {
  activity: ChatAgentActivity = 'unknown';
  private lastActivityAt: number | null = null;
  private nextOpen: number | null = null;
  private failedOpens = 0;

  constructor(
    private readonly timing: ChatTiming,
    private readonly now: () => number,
  ) {}

  /** Looks for the transcript at the next turn, and backs off afresh. */
  openNow(): void {
    this.nextOpen = null;
    this.failedOpens = 0;
  }

  get openIsDue(): boolean {
    return this.nextOpen === null || this.now() >= this.nextOpen;
  }

  /** The entries changed: stay at the active pace for a while. */
  noteChange(): void {
    this.lastActivityAt = this.now();
  }

  /** herdr reports another status. Returns whether it changed. */
  noteActivity(activity: ChatAgentActivity): boolean {
    if (activity === this.activity) return false;
    this.activity = activity;
    this.noteChange();
    this.openNow();
    return true;
  }

  /** After an open: when to look again. */
  afterOpen(snapshot: ChatConversationSnapshot): void {
    const { phase } = snapshot;
    if (
      phase.type === 'following' ||
      (phase.type === 'unavailable' && phase.reason.kind === 'awaitingFirstMessage')
    ) {
      // A new conversation's file comes during a turn that keeps the active pace: look every pass.
      this.openNow();
      return;
    }
    const delays = this.timing.locateBackoffMs;
    const delay =
      delays.length === 0 ? 0 : (delays[Math.min(this.failedOpens, delays.length - 1)] ?? 0);
    this.failedOpens += 1;
    this.nextOpen = this.now() + delay;
  }

  /** The pause after each turn. */
  interval(hasConversation: boolean): number {
    if (!hasConversation) return this.timing.sessionRecheckMs;
    if (this.activity === 'working' || this.activity === 'blocked') {
      return this.timing.activeIntervalMs;
    }
    const last = this.lastActivityAt;
    if (last !== null && this.now() - last < this.timing.activeLingerMs) {
      return this.timing.activeIntervalMs;
    }
    return this.timing.idleIntervalMs;
  }
}
