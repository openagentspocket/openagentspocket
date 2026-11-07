import type { Clock } from '../hosts/cancellation';
import type { InputSessionGeneration } from '../terminal/input-port';
import { containsOnlySafeScalars } from '../terminal/text-safety';
import { deliveryFailureText, isApiCode, refusalFailureText } from './failure';
import {
  type ComposerDeliveryPolicy,
  type ComposerNotice,
  type ComposerRefusal,
  type ComposerRoute,
  refusalEndsWhenStatusBecomes,
  terminalPolicy,
} from './policy';
import {
  advanceMessage,
  type ComposerDelivery,
  type ComposerMessage,
  progressAfterAck,
  type Tracking,
} from './progress';
import { promptWaitingOutLaunch } from './prompt-launch';
import { ComposerStopStore } from './stop';

/** How Send finished. `deliveredViaAttach` is the view's cue to present the tools keyboard. */
export type ComposerSendResult =
  | { readonly kind: 'ignored' }
  | { readonly kind: 'deliveredViaPrompt' }
  | { readonly kind: 'deliveredViaAttach' }
  | { readonly kind: 'failed' }
  /** The policy declined the draft, which is back in the Composer. */
  | { readonly kind: 'refused'; readonly refusal: ComposerRefusal };

/** The `agent.prompt` call, already bound to a Host. Resolves when herdr accepted the text. */
export type ComposerPrompt = (params: { target: string; text: string }) => Promise<void>;

/** The live Attach PTY writer; false when there is no live session to write to. */
export interface ComposerAttachInput {
  insertComposerDraft(text: string): boolean;
}

/** The live terminal's record of messages that went round the PTY, for Message Jump to find. */
export interface ComposerSubmitRecorder {
  readonly liveGeneration: InputSessionGeneration | null;
  recordSubmitted(text: string, generation: InputSessionGeneration): void;
}

export interface Selection {
  readonly start: number;
  readonly end: number;
}

export type { ComposerDelivery, ComposerMessage, ComposerProgress } from './progress';

export interface ComposerSnapshot {
  readonly draft: string;
  readonly selection: Selection;
  readonly messages: readonly ComposerMessage[];
  readonly notice: ComposerNotice | undefined;
  readonly status: string;
}

export interface ComposerStoreOptions {
  readonly target: string;
  readonly prompt: ComposerPrompt;
  readonly clock: Clock;
  readonly initialStatus?: string;
  readonly initialDraft?: string;
  /** Called with the draft after every change, to persist it. */
  readonly onDraft?: (draft: string) => void;
  /** Pace and budget for waiting out a fresh Agent's launch on `agent_not_ready`. */
  readonly notReadyRetryMs?: number;
  readonly notReadyBudgetMs?: number;
}

const UNSENDABLE = 'The message could not be sent. Check the connection and retry.';
const UNSAFE = 'The message contains unsafe terminal control characters.';

/**
 * One Agent's local draft and delivery state. Draft edits never touch the Transport. Send
 * delivers through one `agent.prompt`, except when Agent Status is Blocked: then the terminal's
 * policy inserts into the live Attach PTY without Enter, and Chat's refuses. Both surfaces share
 * the one draft; each message remembers which surface sent it.
 */
export class ComposerStore {
  readonly stop: ComposerStopStore;
  private draft: string;
  private selection: Selection;
  private messages: ComposerMessage[] = [];
  private notice: ComposerNotice | undefined;
  private status: string;
  private statusRevision = 0;
  private nextId = 1;
  private readonly tracking = new Map<string, Tracking>();
  private attach: ComposerAttachInput | undefined;
  private recorder: ComposerSubmitRecorder | undefined;
  private snapshot: ComposerSnapshot | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: ComposerStoreOptions) {
    this.stop = new ComposerStopStore(options.clock);
    this.draft = options.initialDraft ?? '';
    this.selection = { start: this.draft.length, end: this.draft.length };
    this.status = options.initialStatus ?? 'idle';
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): ComposerSnapshot => {
    this.snapshot ??= {
      draft: this.draft,
      selection: this.selection,
      messages: this.messages,
      notice: this.notice,
      status: this.status,
    };
    return this.snapshot;
  };

  get canSend(): boolean {
    return this.draft.trim().length > 0;
  }

  /** The already-open Attach PTY writer; Blocked Send uses the same pipe as the tools keyboard. */
  bindAttachInput(input: ComposerAttachInput | undefined): void {
    this.attach = input;
  }

  /** Who hears of each accepted `agent.prompt`; the returned function ends that. */
  bindSubmitRecorder(recorder: ComposerSubmitRecorder): () => void {
    this.recorder = recorder;
    return () => {
      if (this.recorder === recorder) this.recorder = undefined;
    };
  }

  replaceDraft(text: string): void {
    this.setDraft(text, { start: text.length, end: text.length });
  }

  /** Typing and selection changes from the text input; keeps the view's caret. */
  applyEditorDraft(text: string, selection: Selection): void {
    const clamped = clampSelection(selection, text.length);
    if (text === this.draft && sameSelection(clamped, this.selection)) return;
    this.setDraft(text, clamped);
  }

  setSelection(selection: Selection): void {
    const clamped = clampSelection(selection, this.draft.length);
    if (sameSelection(clamped, this.selection)) return;
    this.selection = clamped;
    this.changed();
  }

  /** Inserts at the caret or replaces the selection: the Snippet / Skill / path insertion path. */
  insertIntoDraft(text: string): void {
    const { start, end } = clampSelection(this.selection, this.draft.length);
    const next = this.draft.slice(0, start) + text + this.draft.slice(end);
    const caret = start + text.length;
    this.setDraft(next, { start: caret, end: caret });
  }

  /**
   * Completes an inline Skill suggestion: swaps the typed trigger token at the end of the draft
   * for the full invocation. A draft that no longer ends with the token is left alone.
   */
  replaceTrailingToken(token: string, text: string): void {
    if (token.length === 0 || !this.draft.endsWith(token)) return;
    this.replaceDraft(this.draft.slice(0, this.draft.length - token.length) + text);
  }

  /** Console's per-Agent status fan-out reaches the Composer here. */
  agentStatusDidChange(status: string): void {
    if (this.status === status) return;
    this.status = status;
    this.statusRevision += 1;
    this.stop.agentStatusChanged(status);
    if (this.notice && refusalEndsWhenStatusBecomes(this.notice.refusal, status)) {
      this.notice = undefined;
    }
    this.messages = this.messages.map((message) =>
      advanceMessage(message, this.tracking.get(message.id), status, this.statusRevision),
    );
    this.changed();
  }

  async send(policy: ComposerDeliveryPolicy = terminalPolicy): Promise<ComposerSendResult> {
    const revision = this.statusRevision;
    return this.noting(await this.sendDraft(policy), policy.route, revision);
  }

  /** Sends a failed message again; the policy should be the one for the message's own route. */
  async retry(
    id: string,
    policy: ComposerDeliveryPolicy = terminalPolicy,
  ): Promise<ComposerSendResult> {
    const revision = this.statusRevision;
    return this.noting(await this.retryMessage(id, policy), policy.route, revision);
  }

  /** Removes a failed echo and restores its text to the draft, in front of anything typed since. */
  withdrawToDraft(id: string): void {
    const message = this.messages.find((candidate) => candidate.id === id);
    if (message?.state.kind !== 'failed') return;
    this.returnToDraft(id);
  }

  private async sendDraft(policy: ComposerDeliveryPolicy): Promise<ComposerSendResult> {
    if (!this.canSend) return { kind: 'ignored' };
    const refusal = policy.validate(this.draft);
    if (refusal) return { kind: 'refused', refusal };
    const id = `m${this.nextId++}`;
    const text = this.draft;
    this.track(id, true);
    this.messages = [
      ...this.messages,
      { id, text, route: policy.route, state: { kind: 'sending' } },
    ];
    this.draft = '';
    this.selection = { start: 0, end: 0 };
    this.notice = undefined;
    this.options.onDraft?.('');
    this.stop.holdAfterSend();
    this.changed();
    return this.preflightThenDeliver(id, text, policy);
  }

  private async retryMessage(
    id: string,
    policy: ComposerDeliveryPolicy,
  ): Promise<ComposerSendResult> {
    const message = this.messages.find((candidate) => candidate.id === id);
    if (message?.state.kind !== 'failed' || message.route !== policy.route) {
      return { kind: 'ignored' };
    }
    const refusal = policy.validate(message.text);
    if (refusal) return { kind: 'refused', refusal };
    this.track(id, true);
    this.update(id, { kind: 'sending' });
    return this.preflightThenDeliver(id, message.text, policy, true);
  }

  private async preflightThenDeliver(
    id: string,
    text: string,
    policy: ComposerDeliveryPolicy,
    isRetry = false,
  ): Promise<ComposerSendResult> {
    const refusal = policy.preflight ? await policy.preflight(text) : undefined;
    if (refusal) {
      if (isRetry) this.fail(id, { kind: 'failed', text: refusalFailureText(refusal) });
      else this.returnToDraft(id);
      return { kind: 'refused', refusal };
    }
    return this.deliver(id, text, policy);
  }

  private async deliver(
    id: string,
    text: string,
    policy: ComposerDeliveryPolicy,
  ): Promise<ComposerSendResult> {
    if (this.status === 'blocked') return this.deliverWhileBlocked(id, text, policy);
    const outgoing = policy.outgoingText(text);
    // Claimed before the wait: the terminal may be a new session by the time herdr answers.
    const recorder = this.recorder;
    const generation = recorder?.liveGeneration ?? null;
    try {
      await promptWaitingOutLaunch(this.options, { target: this.options.target, text: outgoing });
    } catch (error) {
      if (isApiCode(error, 'agent_blocked')) return this.deliverWhileBlocked(id, text, policy);
      return this.fail(id, { kind: 'failed', text: deliveryFailureText(error) });
    }
    const message = this.messages.find((candidate) => candidate.id === id);
    if (!message) return { kind: 'ignored' };
    this.update(id, {
      kind: 'delivered',
      progress: progressAfterAck(this.tracking.get(id), this.status, this.statusRevision),
    });
    if (generation !== null) recorder?.recordSubmitted(outgoing, generation);
    const verify = policy.verify;
    if (verify) {
      void verify(outgoing).then((seen) => {
        if (!seen) this.markUndelivered(id);
      });
    }
    return { kind: 'deliveredViaPrompt' };
  }

  private deliverWhileBlocked(
    id: string,
    text: string,
    policy: ComposerDeliveryPolicy,
  ): ComposerSendResult {
    if (!policy.insertsIntoAttachWhenBlocked) {
      this.returnToDraft(id);
      return { kind: 'refused', refusal: { kind: 'agentBlocked' } };
    }
    if (!containsOnlySafeScalars(text)) return this.fail(id, { kind: 'failed', text: UNSAFE });
    if (!this.attach?.insertComposerDraft(text)) {
      return this.fail(id, { kind: 'failed', text: UNSENDABLE });
    }
    const tracking = this.tracking.get(id);
    if (tracking) tracking.tracksProgress = false;
    this.update(id, { kind: 'delivered', progress: 'acknowledged' });
    return { kind: 'deliveredViaAttach' };
  }

  private noting(
    result: ComposerSendResult,
    route: ComposerRoute,
    revision: number,
  ): ComposerSendResult {
    // A refusal may rest on a screen read before Agent Status changed under the Send.
    if (
      result.kind === 'refused' &&
      (revision === this.statusRevision ||
        !refusalEndsWhenStatusBecomes(result.refusal, this.status))
    ) {
      this.notice = { refusal: result.refusal, route };
    } else {
      this.notice = undefined;
    }
    this.changed();
    return result;
  }

  private track(id: string, resetObserved: boolean): void {
    const previous = this.tracking.get(id);
    this.tracking.set(id, {
      workingAtSend: this.status === 'working',
      revisionAtSend: this.statusRevision,
      observedWorking: resetObserved ? false : (previous?.observedWorking ?? false),
      tracksProgress: true,
    });
  }

  private markUndelivered(id: string): void {
    const message = this.messages.find((candidate) => candidate.id === id);
    if (message?.state.kind !== 'delivered') return;
    const tracking = this.tracking.get(id);
    if (tracking) tracking.tracksProgress = false;
    this.update(id, { kind: 'undelivered' });
  }

  private fail(id: string, state: ComposerDelivery): ComposerSendResult {
    if (!this.messages.some((message) => message.id === id)) return { kind: 'ignored' };
    this.update(id, state);
    return { kind: 'failed' };
  }

  private update(id: string, state: ComposerDelivery): void {
    this.messages = this.messages.map((message) =>
      message.id === id ? { ...message, state } : message,
    );
    this.changed();
  }

  private returnToDraft(id: string): void {
    const message = this.messages.find((candidate) => candidate.id === id);
    if (!message) return;
    this.messages = this.messages.filter((candidate) => candidate.id !== id);
    this.tracking.delete(id);
    const next = this.draft === '' ? message.text : `${message.text}\n${this.draft}`;
    this.setDraft(next, { start: next.length, end: next.length });
  }

  private setDraft(text: string, selection: Selection): void {
    if (text !== this.draft) {
      this.notice = undefined;
      this.options.onDraft?.(text);
    }
    this.draft = text;
    this.selection = selection;
    this.changed();
  }

  private changed(): void {
    this.snapshot = undefined;
    for (const listener of [...this.listeners]) listener();
  }
}

function clampSelection(selection: Selection, length: number): Selection {
  const start = Math.min(Math.max(selection.start, 0), length);
  const end = Math.min(Math.max(selection.end, start), length);
  return { start, end };
}

function sameSelection(a: Selection, b: Selection): boolean {
  return a.start === b.start && a.end === b.end;
}
