// The send tracker one conversation store keeps for its Agent (the Swift AgentChatStore's send
// state, ADR 0024): created on the first message Chat sends, fed by the store's loop, and read
// through the host below. The store owns when it checks; this owns what it checks with.

import type { AnsiScreen } from '../../blocked/screen';
import type { ChatAgentActivity, ChatProgram } from '../model/types';
import type { SendStatus, SentMessage } from '../send/echoes';
import { sendPolicyFor } from '../send/registry';
import { SendTracker } from '../send/tracker';
import type { ChatConversationSnapshot } from './snapshot';
import type { ConversationState, ConversationStoreOptions } from './store-types';

interface Wiring {
  readonly options: ConversationStoreOptions;
  readonly now: () => number;
  readonly echoKey: (program: ChatProgram, text: string) => string;
  readonly state: () => ConversationState;
  readonly generation: () => number;
  readonly followedSessionID: () => string | null;
  /** A prompt was just sent: the Agent is about to write. */
  readonly sent: () => void;
  /** A send went overdue: look for the transcript again. */
  readonly overdue: () => void;
  readonly wake: () => void;
  /** Statuses changed. */
  readonly changed: (statuses: ReadonlyMap<string, SendStatus>) => void;
}

export class ConversationSends {
  private tracker: SendTracker | null = null;

  constructor(private readonly wiring: Wiring) {}

  update(messages: readonly SentMessage[]): void {
    this.ensure()?.updateSends(messages);
  }

  concern(outgoing: string, screen: AnsiScreen): string | null {
    return this.tracker?.sendConcern(outgoing, screen) ?? null;
  }

  inputBoxWasRead(screen: AnsiScreen): void {
    this.tracker?.inputBoxWasRead(screen);
  }

  agentStatusChanged(activity: ChatAgentActivity, previous: ChatAgentActivity): void {
    this.tracker?.agentStatusChanged(activity, previous);
  }

  /** A transcript read that started at `startedAt` (null: none) was applied, giving `snapshot`. */
  readApplied(startedAt: number | null, snapshot: ChatConversationSnapshot): void {
    if (
      startedAt !== null &&
      snapshot.phase.type === 'following' &&
      snapshot.readFailure === null
    ) {
      this.tracker?.noteReadApplied(startedAt);
    }
  }

  conversationChanged(): void {
    this.tracker?.conversationChanged();
  }

  match(): void {
    this.tracker?.match();
  }

  /** What a send's echo waits on besides the transcript, once per turn of the loop; stops when `isCurrent` turns false. */
  async check(isCurrent: () => boolean): Promise<void> {
    const tracker = this.tracker;
    if (!tracker) return;
    await tracker.checkReturnedSends();
    if (!isCurrent()) return;
    await tracker.checkRefusedCompactions();
    if (!isCurrent()) return;
    await tracker.checkSendWitnesses();
  }

  private ensure(): SendTracker | null {
    if (this.tracker) return this.tracker;
    const { options, wiring } = { options: this.wiring.options, wiring: this.wiring };
    const view = options.agent();
    if (!view) return null;
    const { program } = view;
    this.tracker = new SendTracker({
      policy: sendPolicyFor(program),
      clock: options.clock,
      files: options.files,
      timing: options.sendTiming,
      now: wiring.now,
      echoKey: (text) => wiring.echoKey(program, text),
      conversation: () => {
        const { snapshot } = wiring.state();
        return {
          transcript: snapshot.transcript,
          readOffset: snapshot.readOffset,
          layoutGeneration: snapshot.layoutGeneration,
          phase: snapshot.phase,
        };
      },
      generation: wiring.generation,
      activity: () => options.agent()?.activity ?? 'unknown',
      followedSessionID: wiring.followedSessionID,
      readScreen: () =>
        options.readScreen
          ? options.readScreen()
          : Promise.reject(new Error('This Host cannot read the Agent screen.')),
      sent: wiring.sent,
      overdue: wiring.overdue,
      refreshAgent: wiring.wake,
      changed: () => {
        const statuses = this.tracker?.statuses;
        if (statuses) wiring.changed(statuses);
      },
    });
    return this.tracker;
  }
}
