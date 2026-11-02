import type { Clock } from '../hosts/cancellation';
import { type AgentBannerTarget, bannerBody, bannerTargetKey, bannerTitle } from './banner-copy';
import type { AgentBanner, BannerAgent, BannerStoreOptions } from './banner-types';

export const BANNER_HOLD_MS = 3000;
export const BANNER_DISMISS_MS = 5000;

type Listener = () => void;

/**
 * The foreground Blocked/Done banner, driven by the Console's live Agent list. The gates mirror the
 * plugin's pipeline: a transition holds before announcing (herdr's status flaps), an unchanged
 * status never repeats, the Agent on screen stays silent (decided at fire time), and a Host whose
 * notify flags are unknown fails closed. A newer banner replaces the current one; a banner expires
 * after `dismissMs` unless a screen reader is running.
 */
export class AgentBannerStore {
  private current: AgentBanner | undefined;
  private shownStatus: string | undefined;
  private readonly statuses = new Map<string, string>();
  private questions = new Map<string, string>();
  private readonly holds = new Map<string, unknown>();
  private dismissal: unknown;
  private armed = false;
  private readonly listeners = new Set<Listener>();
  private readonly holdMs: number;
  private readonly dismissMs: number;

  constructor(
    private readonly clock: Clock,
    private readonly options: BannerStoreOptions,
  ) {
    this.holdMs = options.holdMs ?? BANNER_HOLD_MS;
    this.dismissMs = options.dismissMs ?? BANNER_DISMISS_MS;
  }

  get banner(): AgentBanner | undefined {
    return this.current;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The Console feed: diffs each pane's status against the last one seen. */
  agentsDidChange(agents: readonly BannerAgent[]): void {
    const live = new Map<string, BannerAgent>();
    for (const agent of agents) live.set(bannerTargetKey(agent), agent);
    for (const key of [...this.statuses.keys()]) {
      if (live.has(key)) continue;
      this.statuses.delete(key);
      this.cancelHold(key);
    }
    this.questions = new Map();
    for (const [key, agent] of live) {
      const snippet = agent.lastOutputSnippet?.trim();
      if (agent.status === 'blocked' && snippet) this.questions.set(key, snippet);
    }
    this.reconcileShown(live);
    if (this.current && !this.armed && !this.options.isScreenReaderOn()) this.armDismissal();
    for (const [key, agent] of live) {
      const previous = this.statuses.get(key);
      if (agent.status === previous) continue;
      this.statuses.set(key, agent.status);
      this.cancelHold(key);
      if (previous === undefined) continue; // first sight is baseline, never a transition
      if (agent.status === 'blocked' || agent.status === 'done') this.scheduleHold(key, agent);
    }
  }

  dismiss(): void {
    this.clearDismissal();
    this.shownStatus = undefined;
    if (!this.current) return;
    this.current = undefined;
    this.emit();
  }

  private reconcileShown(live: Map<string, BannerAgent>): void {
    const shown = this.current;
    if (!shown) return;
    const key = bannerTargetKey(shown.target);
    if (live.get(key)?.status !== this.shownStatus) {
      this.dismiss(); // answered, moved on or closed: the banner would be stale
      return;
    }
    const question = this.questions.get(key);
    if (shown.question === undefined && this.shownStatus === 'blocked' && question !== undefined) {
      this.current = { ...shown, question };
      this.emit();
    }
  }

  private scheduleHold(key: string, agent: BannerAgent): void {
    this.holds.set(
      key,
      this.clock.setTimeout(() => {
        this.holds.delete(key);
        this.present(key, agent);
      }, this.holdMs),
    );
  }

  private cancelHold(key: string): void {
    if (!this.holds.has(key)) return;
    this.clock.clearTimeout(this.holds.get(key));
    this.holds.delete(key);
  }

  private present(key: string, agent: BannerAgent): void {
    const target: AgentBannerTarget = { hostId: agent.hostId, paneId: agent.paneId };
    const presented = this.options.presentedAgent();
    if (presented && bannerTargetKey(presented) === key) return;
    const notify = this.options.triggers(agent.hostId);
    if (!notify || !(agent.status === 'done' ? notify.done : notify.blocked)) return;
    const question = agent.status === 'blocked' ? this.questions.get(key) : undefined;
    const banner: AgentBanner = {
      target,
      status: agent.status,
      title: bannerTitle(agent.workspaceLabel, agent.kind),
      body: bannerBody(agent.status),
      ...(question === undefined ? {} : { question }),
    };
    this.current = banner;
    this.shownStatus = agent.status;
    this.options.playSound();
    this.options.announce(`${banner.title}. ${question ?? this.options.renderBody(banner.body)}`);
    if (this.options.isScreenReaderOn()) this.clearDismissal();
    else this.armDismissal();
    this.emit();
  }

  private armDismissal(): void {
    this.clearDismissal();
    this.armed = true;
    this.dismissal = this.clock.setTimeout(() => {
      this.armed = false;
      this.dismissal = undefined;
      this.shownStatus = undefined;
      this.current = undefined;
      this.emit();
    }, this.dismissMs);
  }

  private clearDismissal(): void {
    if (this.armed) this.clock.clearTimeout(this.dismissal);
    this.armed = false;
    this.dismissal = undefined;
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
