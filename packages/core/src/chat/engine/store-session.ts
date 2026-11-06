import { programDefinition } from '../programs/registry';
// Which conversation a program that can leave it without a report is really in (the session half of
// Swift AgentChatStore: `adoptRecord`, `confirmSessionBeforeSend` and the start-screen watch, ADR
// 0025). OpenCode's `/new` leaves herdr reporting the conversation it left for its home screen: the
// watch marks that conversation stale, so Chat shows none until the program is back in a conversation,
// and each send re-reads the Agent's record and the terminal title first. Everything a program adds
// comes from its `ProgramSendPolicy` capabilities; nothing here names one.

import type { ConversationReference } from '../model/conversation-reference';
import { sendPolicyFor } from '../send/registry';
import { type ChatAgentView, type ConversationStoreOptions, sameReference } from './store-types';

interface SessionHost {
  readonly options: ConversationStoreOptions;
  readonly now: () => number;
  /** The conversation Chat follows, and the one herdr reports. */
  readonly followed: () => ConversationReference | null;
  readonly boundTo: () => ConversationReference | null;
  /** Binds again to what `view` reports (the store's bind step). */
  readonly rebind: (view: ChatAgentView | undefined) => void;
  readonly isVisible: () => boolean;
  readonly generation: () => number;
  readonly transcriptTitle: () => string | null;
  readonly wake: () => void;
  /** How long between two looks at the Agent's screen for the start-screen watch. */
  readonly recheckMs: number;
}

export class SessionWatch {
  /** The conversation the program left for its home screen: herdr's reports of it read as none. */
  stale: ConversationReference | null = null;
  private staleTitle: string | null = null;
  /** A record read for a send, newer than the Console's, until the Console's record changes. */
  private override: { view: ChatAgentView; baseline: string } | null = null;
  private requested = false;
  private lastCheck = Number.NEGATIVE_INFINITY;
  /** The session found on the Host while herdr reports none, and when it was last looked for. */
  private discovered: string | null = null;
  private lastDiscovery = Number.NEGATIVE_INFINITY;

  constructor(private readonly host: SessionHost) {}

  /** The record Chat binds to: the Console's, or herdr's newer answer to a send's check. */
  view(): ChatAgentView | undefined {
    const reported = this.host.options.agent();
    if (this.override) {
      if (JSON.stringify(reported ?? null) === this.override.baseline) return this.override.view;
      this.override = null;
    }
    if (reported && !reported.session && reported.program && this.discovered) {
      const { program } = reported;
      const session = {
        source: `herdr:${program}`,
        agent: program,
        kind: 'id',
        value: this.discovered,
      };
      return { ...reported, session } as ChatAgentView;
    }
    return reported;
  }

  /** Asks the Host for the conversation of an Agent herdr names none for, at the recheck pace. */
  async discover(): Promise<void> {
    const { options } = this.host;
    const view = options.agent();
    if (!view?.program || view.session) {
      this.discovered = null;
      return;
    }
    const find = programDefinition(view.program).discoverSession;
    if (!find || this.host.now() - this.lastDiscovery < this.host.recheckMs) return;
    this.lastDiscovery = this.host.now();
    const directories = [view.foregroundCwd, view.cwd].filter((cwd) => cwd !== null);
    try {
      this.discovered = await find(options.files, directories);
    } catch {
      // The Host may be away: the next look decides.
    }
  }

  /** The user asked to look again (Retry): the screen is read once whatever the title says. */
  requestCheck(): void {
    this.requested = true;
  }

  /** A report of another conversation than the stale one ends the mark. */
  noteBinding(boundTo: ConversationReference | null): void {
    if (this.stale && boundTo && !sameReference(boundTo, this.stale)) this.forget();
  }

  forget(): void {
    this.stale = null;
    this.staleTitle = null;
  }

  /**
   * Re-reads the Agent's record once and adopts it, then compares the terminal title with the
   * conversation's. Why the message would land outside the conversation Chat shows, or null to go on.
   * Null without a policy that asks for it, and for a transport that cannot read the record.
   */
  async confirmBeforeSend(): Promise<string | null> {
    const { options } = this.host;
    const view = this.view();
    if (!view || view.program === null) return null;
    const policy = sendPolicyFor(view.program);
    if (!policy.confirmsSessionBeforeSend || !options.agentInfo) return null;
    const name = policy.chatName;
    const shown = this.host.followed();
    let fresh: ChatAgentView;
    try {
      fresh = await options.agentInfo();
    } catch {
      return `Agentico couldn't check which conversation ${name} shows, so it sent nothing. Try again.`;
    }
    this.override = { view: fresh, baseline: JSON.stringify(options.agent() ?? null) };
    this.host.rebind(fresh);
    if (!sameReference(this.host.followed(), shown)) {
      this.host.wake();
      return `herdr now reports another ${name} conversation for this Agent. Chat is switching to it; check it, then send again.`;
    }
    if (this.stale) {
      return `${name} is on its home screen, so this conversation isn't open there. Open it in the terminal first.`;
    }
    const verdict = policy.terminalTitle?.verdict(
      fresh.terminalTitle ?? null,
      this.host.transcriptTitle(),
    );
    if (verdict?.kind === 'differs') {
      return `${name}'s terminal shows another conversation (${verdict.title}). Open this one in the terminal, then send again.`;
    }
    return null;
  }

  /**
   * The start-screen watch: while Chat shows the idle Agent, the screen is read once unless the
   * terminal title is the followed conversation's own, and the home screen marks the conversation
   * stale. The mark clears when herdr reports another conversation, when the screen shows a
   * conversation under the stale one's title (unless the home screen has that title too), and on the
   * first read after Retry.
   */
  async checkStartScreen(view: ChatAgentView): Promise<void> {
    if (view.program === null) return;
    const { options } = this.host;
    const policy = sendPolicyFor(view.program);
    const { terminalTitle: title, screenRoute } = policy;
    const retried = this.requested;
    this.requested = false;
    if (!policy.leavesSessionWithoutReport || !title || !screenRoute || !options.readScreen) return;
    if (!this.host.isVisible() || view.activity !== 'idle') return;
    const terminal = view.terminalTitle ?? null;
    const due = this.host.now() - this.lastCheck >= this.host.recheckMs;
    const generation = this.host.generation();
    const route = async () => {
      this.lastCheck = this.host.now();
      try {
        return screenRoute(await (options.readScreen as NonNullable<typeof options.readScreen>)());
      } catch {
        return null;
      }
    };
    const unchanged = () => this.host.generation() === generation && this.host.isVisible();
    if (this.stale) {
      const showsStaleTitle = this.staleTitle !== title.untitled && terminal === this.staleTitle;
      if (!(showsStaleTitle || retried) || !(due || retried)) return;
      const shown = await route();
      if (shown !== 'session' || !unchanged() || !this.stale) return;
      this.forget();
      this.host.rebind(this.view());
      this.host.wake();
      return;
    }
    const followed = this.host.followed();
    if (!followed || !sameReference(followed, this.host.boundTo())) return;
    const sessionTitle = this.host.transcriptTitle();
    if (title.verdict(terminal, sessionTitle).kind === 'matches') return;
    if (!(due || retried)) return;
    const shown = await route();
    if (shown !== 'home' || !unchanged() || !sameReference(followed, this.host.followed())) return;
    this.stale = followed;
    this.staleTitle = title.expected(sessionTitle);
    this.host.rebind(this.view());
  }
}
