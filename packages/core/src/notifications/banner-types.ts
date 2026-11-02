import type { Message } from '../errors';
import type { AgentBannerTarget } from './banner-copy';

/** One Agent as the banner store reads it from the Console's live list. */
export interface BannerAgent extends AgentBannerTarget {
  readonly status: string;
  readonly kind: string;
  readonly workspaceLabel?: string;
  /** What a Blocked Agent asks, read from its terminal. */
  readonly lastOutputSnippet?: string;
}

/** One banner ready to show: where a tap lands and the push copy. */
export interface AgentBanner {
  readonly target: AgentBannerTarget;
  readonly status: string;
  readonly title: string;
  readonly body: Message;
  /** A Blocked Agent's question, shown in place of the body. Push never carries it. */
  readonly question?: string;
}

export interface BannerStoreOptions {
  /** The Agent on screen, read at fire time. */
  presentedAgent(): AgentBannerTarget | undefined;
  /** The Host's confirmed notify flags; undefined (unknown) means no banner. */
  triggers(hostId: string): { readonly blocked: boolean; readonly done: boolean } | undefined;
  playSound(): void;
  isScreenReaderOn(): boolean;
  announce(text: string): void;
  /** Renders the body in the current locale for the spoken announcement. */
  renderBody(body: Message): string;
  holdMs?: number;
  dismissMs?: number;
}
