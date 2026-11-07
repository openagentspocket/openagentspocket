import type { Text } from '../errors/text';
import { CardBase } from './card-base';
import {
  CARD_WORDS,
  type CardContent,
  genericExcerptOf,
  planErrorText,
  refusedAsChanged,
  sendFailureText,
} from './card-support';
import { type DialogFingerprint, fingerprintsMatch, mergeFingerprints } from './fingerprint';
import {
  confirmationMet,
  type DialogObservation,
  expectationMet,
  type ObservedActivity,
} from './observation';
import type {
  ConfirmationRule,
  DialogAction,
  DialogActionPlan,
  DialogStep,
  PlanResult,
} from './plan-types';
import { planDialogAction, planGenericOption } from './programs';
import { type BlockedDialog, resultDialog, resultFingerprint } from './types';

/**
 * Chat's answer to herdr's Blocked (Swift `BlockedCardStore`): the dialog on the Agent's screen
 * as a native card, answered with keys.
 *
 * The screen decides everything a card offers. An action reads it again first and sends nothing
 * if the dialog changed, waits until the dialog has shown for a moment, sends the plan's keys
 * while checking each expectation, then watches for the effect. Nothing is ever resent: a dialog
 * that does not respond keeps its answers off until the screen shows something else or the
 * transcript shows the answer took.
 */
export class BlockedCardStore extends CardBase {
  private openQuestion = false;
  private waiting: ReadonlySet<string> = new Set();
  private unconfirmed: DialogFingerprint | null = null;
  private firstSeen: { fingerprint: DialogFingerprint; at: number } | null = null;
  private degraded: { fingerprint: DialogFingerprint; reason: Text } | null = null;
  private quietSince: number | null = null;

  /** Whether Stop acts: also after an answer that showed no effect, as a way out. */
  get canStop(): boolean {
    return this.state.progress !== 'acting';
  }

  // Inputs

  /** The Agent or its Host is gone. */
  end(): void {
    this.ended = true;
    this.visible = false;
    this.updateWatching();
    this.clear();
  }

  setCollapsed(isCollapsed: boolean): void {
    this.patch({ isCollapsed });
  }

  /** herdr's latest status. Leaving Blocked clears the card unless an action is checking its effect. */
  setActivity(activity: ObservedActivity): void {
    if (activity === this.activity) return;
    this.activity = activity;
    if (activity === 'blocked') this.quietSince = this.now();
    if (!this.readsScreen && this.state.progress !== 'acting') this.clear();
    this.updateWatching();
  }

  /**
   * The transcript as last read: the ids of calls waiting for approval, those whose results show,
   * and whether a question is open. herdr can report an Agent idle over one, so an open question
   * reads the screen as Blocked does; only a dialog read there offers anything.
   */
  setCalls(calls: {
    waiting: ReadonlySet<string>;
    resolved: ReadonlySet<string>;
    openQuestion?: boolean;
  }): void {
    const before = this.waiting;
    this.waiting = calls.waiting;
    const openQuestion = calls.openQuestion ?? false;
    if (openQuestion && !this.openQuestion) this.quietSince = this.now();
    this.openQuestion = openQuestion;
    // Two identical dialogs in a row look unchanged on screen, so an answer that showed no effect
    // took once a call that waited resolves. A call that only starts waiting proves nothing.
    if (this.state.progress === 'unconfirmed') {
      for (const id of before) {
        if (calls.resolved.has(id) && !this.resolved.has(id)) {
          this.unconfirmed = null;
          this.patch({ progress: 'ready' });
          break;
        }
      }
    }
    this.resolved = calls.resolved;
    if (
      !this.readsScreen &&
      this.state.progress !== 'acting' &&
      this.state.content.kind !== 'none'
    ) {
      this.clear();
    }
    this.updateWatching();
  }

  /** Read through a getter: TypeScript cannot see the state change across an await. */
  private get isActing(): boolean {
    return this.state.progress === 'acting';
  }

  protected get readsScreen(): boolean {
    return this.activity === 'blocked' || this.openQuestion;
  }

  // Actions

  /** Answers the card's dialog. After an answer with no effect only Stop goes, so a tap is never a resend. */
  async perform(action: DialogAction): Promise<void> {
    const { progress, content } = this.state;
    const allowed = progress === 'ready' || (action.kind === 'dismiss' && progress !== 'acting');
    if (!allowed || content.kind !== 'card') return;
    await this.act(content.dialog.fingerprint, (observation): PlanResult => {
      const dialog = resultDialog(observation.result);
      if (!dialog) return refusedAsChanged;
      const toolUseID = this.options.toolUseIdFor?.(dialog) ?? null;
      return planDialogAction(dialog, action, toolUseID);
    });
  }

  /** The generic card's option button. */
  async press(number: number): Promise<void> {
    const { progress, content } = this.state;
    if (progress !== 'ready' || content.kind !== 'generic') return;
    const reason = this.degraded?.reason ?? '';
    await this.act(content.excerpt.fingerprint, (observation): PlanResult => {
      const { result } = observation;
      if (result.kind === 'none') return refusedAsChanged;
      const excerpt =
        result.kind === 'unrecognized'
          ? result.excerpt
          : genericExcerptOf(result.dialog, observation.screen, reason);
      return planGenericOption(number, excerpt, this.options.program);
    });
  }

  /** The key pad: keys the user picks, sent as they are, then a fresh read. */
  async sendKeys(keys: readonly string[]): Promise<void> {
    if (this.state.progress === 'acting') return;
    this.patch({ progress: 'acting', notice: null });
    let notice: Text | null = null;
    try {
      await this.options.io.sendKeys(keys);
    } catch (error) {
      notice = sendFailureText(error);
    }
    await this.pause(this.timing.pollMs);
    this.patch({ progress: this.unconfirmed ? 'unconfirmed' : 'ready', notice });
    const observation = await this.observe();
    if (observation) {
      this.releaseIfChanged(observation);
      this.present(observation);
    }
  }

  // Watching

  /** One watch read; an action in flight reads for itself. */
  async refresh(): Promise<void> {
    if (this.isActing || !this.readsScreen) return;
    const observation = await this.observe();
    if (this.isActing || !this.readsScreen) return;
    if (!observation) {
      if (this.state.content.kind === 'none') this.patch({ content: this.noDialogContent });
      return;
    }
    this.releaseIfChanged(observation);
    this.present(observation);
  }

  /** Brings the controls back once the dialog an answer showed no effect on has gone. */
  private releaseIfChanged(observation: DialogObservation): void {
    const unconfirmed = this.unconfirmed;
    if (this.state.progress !== 'unconfirmed' || !unconfirmed) return;
    const fresh = resultFingerprint(observation.result);
    if (fresh && fingerprintsMatch(unconfirmed, fresh)) {
      this.unconfirmed = mergeFingerprints(unconfirmed, fresh);
      return;
    }
    this.unconfirmed = null;
    this.patch({ progress: 'ready' });
  }

  // Acting

  /** Whether the plan's effect showed. */
  private async act(
    shown: DialogFingerprint,
    planner: (observation: DialogObservation) => PlanResult,
  ): Promise<boolean> {
    this.patch({ progress: 'acting', notice: null });
    const fresh = await this.observe();
    if (!fresh) return this.finish(CARD_WORDS.unread);
    this.present(fresh);
    const now = resultFingerprint(fresh.result);
    if (!now || !fingerprintsMatch(now, shown)) return this.finish(CARD_WORDS.changed);
    const planned = planner(fresh);
    if (!planned.ok) return this.finish(planErrorText(planned.error));
    const wasBlocked = this.activity === 'blocked';
    await this.waitOutGrace(shown, resultDialog(fresh.result)?.kind);
    if (!(await this.send(planned.plan.steps, shown))) return false;
    return this.confirm(planned.plan, shown, wasBlocked);
  }

  /** Sends `steps`, checking each expectation before the next step; false when it stopped. */
  private async send(
    steps: readonly DialogStep[],
    fingerprint: DialogFingerprint,
  ): Promise<boolean> {
    for (const step of steps) {
      try {
        if (step.kind === 'keys') {
          await this.options.io.sendKeys(step.keys);
        } else if (step.kind === 'paste') {
          await this.options.io.paste(step.text);
        } else {
          const check = await this.poll(this.timing.expectationWindowMs, (observation) =>
            expectationMet(step.expectation, observation, fingerprint),
          );
          if (!check.isMet) {
            this.stopPartWay(fingerprint, check.last);
            return false;
          }
        }
      } catch (error) {
        // The keys may have landed: say so, send nothing more.
        this.finish(sendFailureText(error));
        return false;
      }
    }
    return true;
  }

  /**
   * Watches for the plan's effect on the dialog with `fingerprint`, and says whether it showed.
   * Leaving Blocked shows nothing for an answer sent while herdr did not report Blocked.
   */
  private async confirm(
    plan: DialogActionPlan,
    fingerprint: DialogFingerprint,
    wasBlocked: boolean,
  ): Promise<boolean> {
    const rule: ConfirmationRule =
      !wasBlocked && plan.confirmation.kind === 'fingerprintChangeOrUnblocked'
        ? { kind: 'fingerprintChange' }
        : plan.confirmation;
    const confirmation = await this.poll(this.timing.confirmationWindowMs, (observation) =>
      confirmationMet(rule, observation, fingerprint),
    );
    const confirmed = confirmation.last;
    if (!confirmation.isMet || !confirmed) {
      // The last read can show lines the first didn't, as OpenCode's rule in place of its request.
      const last = confirmation.last ? resultFingerprint(confirmation.last.result) : null;
      this.unconfirmed =
        last && fingerprintsMatch(last, fingerprint)
          ? mergeFingerprints(fingerprint, last)
          : fingerprint;
      this.patch({ progress: 'unconfirmed', notice: CARD_WORDS.unconfirmed });
      return false;
    }
    this.unconfirmed = null;
    this.quietSince = this.now();
    this.patch({ progress: 'ready' });
    this.present(confirmed);
    if (plan.focusesComposer) {
      this.patch({ composerFocusRequest: this.state.composerFocusRequest + 1 });
    }
    return true;
  }

  private finish(notice: Text): false {
    this.patch({ progress: this.unconfirmed ? 'unconfirmed' : 'ready', notice });
    return false;
  }

  /** A step the dialog did not answer as expected: nothing more is sent; the dialog goes generic. */
  private stopPartWay(fingerprint: DialogFingerprint, last: DialogObservation | null): void {
    this.degraded = { fingerprint, reason: CARD_WORDS.stopped };
    this.unconfirmed = null;
    this.patch({ progress: 'ready' });
    if (last) this.present(last);
    this.patch({ notice: CARD_WORDS.stopped });
  }

  /** Waits until the dialog has shown long enough to take a key: the grace, or an OMP approval's arm. */
  private async waitOutGrace(
    fingerprint: DialogFingerprint,
    kind: BlockedDialog['kind'] | undefined,
  ): Promise<void> {
    const seen = this.firstSeen;
    if (!seen || !fingerprintsMatch(seen.fingerprint, fingerprint)) return;
    const settle =
      kind === 'ompApproval'
        ? Math.max(this.timing.graceMs, this.timing.approvalArmMs)
        : this.timing.graceMs;
    const wait = seen.at + settle - this.now();
    if (wait > 0) await this.pause(wait);
  }

  // Presenting

  private present(observation: DialogObservation): void {
    const fingerprint = resultFingerprint(observation.result);
    const seen = this.firstSeen;
    if (seen && fingerprint && fingerprintsMatch(seen.fingerprint, fingerprint)) {
      // The same dialog, its focus perhaps moved: keep when it showed and the lines each read showed.
      this.firstSeen = {
        fingerprint: mergeFingerprints(seen.fingerprint, fingerprint),
        at: seen.at,
      };
    } else if (fingerprint || seen) {
      this.firstSeen = fingerprint ? { fingerprint, at: this.now() } : null;
      if (
        this.degraded &&
        !(fingerprint && fingerprintsMatch(this.degraded.fingerprint, fingerprint))
      ) {
        this.degraded = null;
      }
      this.patch({
        dialogGeneration: this.state.dialogGeneration + 1,
        notice: null,
        ...(fingerprint ? { isCollapsed: false } : {}),
      });
    }
    this.patch({ content: this.contentFor(observation) });
  }

  private contentFor(observation: DialogObservation): CardContent {
    const { result } = observation;
    if (result.kind === 'dialog') {
      const { degraded } = this;
      if (degraded && fingerprintsMatch(degraded.fingerprint, result.dialog.fingerprint)) {
        return {
          kind: 'generic',
          excerpt: genericExcerptOf(result.dialog, observation.screen, degraded.reason),
        };
      }
      return { kind: 'card', dialog: result.dialog };
    }
    if (result.kind === 'unrecognized') return { kind: 'generic', excerpt: result.excerpt };
    return this.noDialogContent;
  }

  /** What stands when no read shows a dialog, once the moment it may be drawing has passed. */
  private get noDialogContent(): CardContent {
    if (this.isQuiet) return { kind: 'none' };
    if (this.activity === 'blocked') return { kind: 'unreadable' };
    return this.activity === 'idle' && this.openQuestion
      ? { kind: 'questionUnread' }
      : { kind: 'none' };
  }

  /** The moment around a dialog appearing or going, when Blocked with nothing on screen is expected. */
  private get isQuiet(): boolean {
    return this.quietSince !== null && this.now() - this.quietSince < this.timing.unreadableAfterMs;
  }

  private clear(): void {
    this.unconfirmed = null;
    this.firstSeen = null;
    this.degraded = null;
    this.patch({ content: { kind: 'none' }, progress: 'ready', notice: null, isCollapsed: false });
  }
}
