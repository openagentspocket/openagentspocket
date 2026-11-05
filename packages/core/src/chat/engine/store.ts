// The conversation of one Agent, observable (the engine-facing part of Swift AgentChatStore):
// resolves which conversation herdr reports, restores the device's copy, then runs one loop that
// makes every engine call in turn. Chat's sends are followed by a `SendTracker` (store-sends.ts).

import type { AnsiScreen } from '../../blocked/screen';
import { asTransportError } from '../../errors';
import type { ConversationReference } from '../model/conversation-reference';
import type { ChatProgram } from '../model/types';
import { projectionContext } from '../model/types';
import type { ChatWorkflowProgress } from '../model/workflow-progress';
import type { SentMessage } from '../send/echoes';
import type { ChatUnavailableReason } from '../timeline/reasons';
import { type ChatTranscriptAdapter, standardAdapter } from './adapter';
import { LoopRunner } from './loop-runner';
import { Pacing } from './pacing';
import { type ChatConversationSnapshot, initialSnapshot } from './snapshot';
import { bindTarget, continuationOf, unavailableSnapshot } from './store-bind';
import { type ConversationEngineRef, createEngine } from './store-engine';
import { ToolOutputLoader } from './store-outputs';
import { ConversationSends } from './store-sends';
import { SessionWatch } from './store-session';
import {
  type ChatAgentView,
  type ChatOutputState,
  type ChatTiming,
  type ConversationState,
  type ConversationStoreOptions,
  DEFAULT_CHAT_TIMING,
  sameReference,
} from './store-types';

export class ConversationStore {
  private readonly timing: ChatTiming;
  private readonly now: () => number;
  private readonly adapterFor: (program: ChatProgram) => ChatTranscriptAdapter | null;
  private readonly listeners = new Set<() => void>();
  private state: ConversationState = {
    snapshot: initialSnapshot(),
    workflowProgress: {},
    outputs: new Map(),
    version: 0,
  };

  private engine: ConversationEngineRef | null = null;
  private followed: ConversationReference | null = null;
  private boundTo: ConversationReference | null = null;
  private continued: ConversationReference | null = null;
  private restored = false;
  private appliedRevision: number | null = null;
  private skillNames: ReadonlySet<string> = new Set();
  private needsRelocate = false;
  private olderRequest: 'user' | 'automatic' | null = null;
  private generation = 0;
  private viewers = new Set<unknown>();
  private suspended = false;
  private ended = false;

  private readonly sends: ConversationSends;
  private readonly session: SessionWatch;
  private readonly outputs: ToolOutputLoader;
  private readonly loop: LoopRunner;
  private readonly pacing: Pacing;

  constructor(private readonly options: ConversationStoreOptions) {
    this.timing = { ...DEFAULT_CHAT_TIMING, ...options.timing };
    this.now = options.now ?? (() => Date.now());
    this.adapterFor = options.adapterFor ?? standardAdapter;
    this.pacing = new Pacing(this.timing, this.now);
    this.sends = new ConversationSends({
      options,
      now: this.now,
      echoKey: (program, text) => this.adapterFor(program)?.echoKey(text) ?? text.trim(),
      state: () => this.state,
      generation: () => this.generation,
      followedSessionID: () => this.followed?.sessionID ?? null,
      sent: () => {
        this.pacing.noteChange();
        this.pacing.openNow();
        this.loop.wake();
      },
      overdue: () => {
        this.needsRelocate = true;
        this.loop.wake();
      },
      wake: () => this.loop.wake(),
      changed: (sendStatuses) => this.commit({ ...this.state, sendStatuses }),
    });
    this.outputs = new ToolOutputLoader({
      state: () => this.state,
      engine: () => this.engine,
      generation: () => this.generation,
      set: (id, o) => this.setOutput(id, o),
    });
    this.session = new SessionWatch({
      options,
      now: this.now,
      followed: () => this.followed,
      boundTo: () => this.boundTo,
      rebind: (view) => this.bind(view),
      isVisible: () => this.viewers.size > 0,
      generation: () => this.generation,
      transcriptTitle: () => this.state.snapshot.transcript.title,
      wake: () => this.loop.wake(),
      recheckMs: this.timing.sessionRecheckMs,
    });
    this.loop = new LoopRunner({
      clock: options.clock,
      step: () => this.step(),
      interval: () => this.interval,
      onError: (thrown) => this.setReadFailure(thrown),
      onStopped: () => this.engine?.save(true) ?? Promise.resolve(),
    });
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getState = (): ConversationState => this.state;

  // MARK: View lifecycle

  /** A Chat view is on screen: follow the conversation. Each view passes its own token. */
  show(viewer: unknown = this): void {
    if (this.ended) return;
    const { phase } = this.state.snapshot;
    const waiting =
      phase.type === 'locating' ||
      (phase.type === 'unavailable' && phase.reason.kind === 'notFound');
    // Opening Chat looks at once and backs off afresh.
    if (this.viewers.size === 0 && waiting) this.pacing.openNow();
    this.viewers.add(viewer);
    this.startLoop();
  }

  /** The last view out stops reading, saving what showed. */
  hide(viewer: unknown = this): void {
    this.viewers.delete(viewer);
    if (this.viewers.size === 0) this.loop.stop();
  }

  suspend(): void {
    this.suspended = true;
    this.loop.stop();
  }

  resume(): void {
    this.suspended = false;
    this.startLoop();
  }

  /** The Agent or its Host is gone. */
  end(): void {
    this.ended = true;
    this.viewers.clear();
    this.loop.stop();
  }

  /** The Console reported something new about the Agent: look again now. */
  agentChanged(): void {
    this.loop.wake();
  }

  /** Looks for the transcript again now, after a failure or an unavailable state the user may have fixed. */
  retry(): void {
    this.session.requestCheck();
    this.pacing.openNow();
    this.loop.wake();
  }

  skillsDidLoad(names: ReadonlySet<string>): void {
    if (names.size === this.skillNames.size && [...names].every((n) => this.skillNames.has(n)))
      return;
    this.skillNames = names;
    this.loop.wake();
  }

  /** Reads one page above the oldest message shown, for the user or, `automatic`, for the timeline. */
  loadOlder(automatic = false): void {
    const { older, olderAwaitsUser, phase } = this.state.snapshot;
    if (phase.type !== 'following') return;
    const bounded = automatic && this.engine?.automaticallyBounded;
    const canLoad = bounded
      ? older.type === 'available' && !olderAwaitsUser
      : older.type === 'available' || older.type === 'failed';
    if (!canLoad) return;
    this.olderRequest = automatic ? 'automatic' : 'user';
    this.setSnapshot({ ...this.state.snapshot, older: { type: 'loading' } });
    this.loop.wake();
  }

  /** Reads a tool's output again for its expanded row, once the transcript is open and the Host connected. */
  loadOutput(entryId: string): void {
    this.outputs.load(entryId);
  }

  /** The Console's Host status changed. Rows expanded while it was not connected are read once it is. */
  hostConnectionChanged(connected: boolean): void {
    this.outputs.hostConnectionChanged(connected);
  }

  // MARK: Loop

  /**
   * One turn: binds the conversation herdr reports, restores local entries before asking the Host,
   * then makes at most one read of the transcript and, after a poll that worked, a few reads of
   * Workflow journals. Public for tests, which drive turns directly.
   */
  async step(): Promise<void> {
    let view = this.session.view();
    this.noteAgent(view);
    this.bind(view);
    if (view) {
      await this.session.checkStartScreen(view);
      view = this.session.view();
    }
    const engine = this.engine;
    if (!engine || !view) return;
    if (!this.restored) {
      this.restored = true;
      this.apply(engine, await engine.restore());
      if (engine !== this.engine) return;
    }
    const context = projectionContext({ activity: view.activity, skillNames: this.skillNames });
    const before = engine.snapshot;
    const readStart = this.now();
    let snapshot: ChatConversationSnapshot;
    let polled = false;
    if (this.olderRequest) {
      const automatic = this.olderRequest === 'automatic';
      this.olderRequest = null;
      snapshot = await engine.loadOlder(context, automatic);
    } else if (before.phase.type === 'following') {
      if (this.needsRelocate) {
        this.needsRelocate = false;
        snapshot = await engine.relocate(context);
        // A search that failed is tried again on the next step.
        if (snapshot.readFailure && engine === this.engine) this.needsRelocate = true;
      } else {
        snapshot = await engine.poll(context);
      }
      polled = true;
    } else if (this.pacing.openIsDue) {
      const directories = [view.foregroundCwd, view.cwd].filter(
        (dir, at, all): dir is string => !!dir && all.indexOf(dir) === at,
      );
      snapshot = await engine.open(directories, context);
      if (engine === this.engine) this.pacing.afterOpen(snapshot);
    } else {
      snapshot = engine.reproject(context);
    }
    if (engine !== this.engine) return;
    this.apply(engine, snapshot);
    this.sends.readApplied(polled ? readStart : null, snapshot);
    this.sends.match();
    // Persist the transcript before optional journal requests can wait on an unavailable connection.
    await engine.save();
    if (engine !== this.engine) return;
    await this.sends.check(() => engine === this.engine);
    if (engine !== this.engine) return;
    if (polled && snapshot.phase.type === 'following' && snapshot.readFailure === null) {
      const progress = await engine.followWorkflows();
      if (engine === this.engine) this.setProgress(progress);
    }
  }

  private noteAgent(view: ChatAgentView | undefined): void {
    // A turn starting or ending is when a session changes, a missing transcript appears, and a
    // turn after an undo writes to the thread's new file.
    if (!view) return;
    const previous = this.pacing.activity;
    if (this.pacing.noteActivity(view.activity)) {
      this.needsRelocate = true;
      this.sends.agentStatusChanged(view.activity, previous);
    }
  }

  // MARK: Sends

  /** The Composer's messages (`sentMessages`), followed until the transcript records each: see `sendStatuses`. */
  readonly updateSends = (messages: readonly SentMessage[]): void => this.sends.update(messages);

  /** Why a send the input box would take waits all the same (another session's screen or log), or null. */
  readonly sendConcern = (outgoing: string, screen: AnsiScreen): string | null =>
    this.sends.concern(outgoing, screen);

  /** The Agent's screen was read for another reason (the check before a send). */
  readonly inputBoxWasRead = (screen: AnsiScreen): void => this.sends.inputBoxWasRead(screen);

  /** The check before a send (`SessionWatch.confirmBeforeSend`): why it would land outside the conversation shown, or null. */
  readonly confirmSessionBeforeSend = (): Promise<string | null> =>
    this.session.confirmBeforeSend();

  /** The pause after each turn. */
  get interval(): number {
    return this.pacing.interval(this.engine !== null);
  }

  private startLoop(): void {
    if (this.suspended || this.ended || this.viewers.size === 0) return;
    this.loop.start();
  }

  // MARK: Binding

  /** Follows the conversation herdr reports, or shows why there is none. */
  private bind(view: ChatAgentView | undefined): void {
    const { target, reason, ...kept } = bindTarget(
      view,
      this.adapterFor,
      this.boundTo,
      this.continued,
      this.session.stale,
    );
    ({ boundTo: this.boundTo, continued: this.continued } = kept);
    this.session.noteBinding(this.boundTo);
    if (sameReference(target, this.followed)) {
      if (!target && reason) this.showUnavailable(reason);
      return;
    }
    const old = this.engine;
    if (old) void old.save(true).catch(() => undefined);
    this.followed = target;
    this.generation += 1;
    this.sends.conversationChanged();
    this.restored = false;
    this.appliedRevision = null;
    this.olderRequest = null;
    this.needsRelocate = false;
    this.pacing.openNow();
    this.outputs.clear();
    this.engine = null;
    this.state = { ...this.state, workflowProgress: {}, outputs: new Map() };
    const adapter = target ? this.adapterFor(target.program) : null;
    if (target && adapter) {
      this.engine = createEngine(this.options, target, adapter, this.now);
      this.setSnapshot(initialSnapshot());
    } else {
      this.showUnavailable(reason ?? { kind: 'unsupportedSession' });
    }
  }

  private showUnavailable(reason: ChatUnavailableReason): void {
    const next = unavailableSnapshot(this.state.snapshot, reason);
    if (next) this.setSnapshot(next);
  }

  // MARK: State

  private apply(origin: ConversationEngineRef, snapshot: ChatConversationSnapshot): void {
    if (origin !== this.engine || snapshot.revision === this.appliedRevision) return;
    this.appliedRevision = snapshot.revision;
    let next = snapshot;
    if (this.olderRequest && next.older.type === 'available')
      next = { ...next, older: { type: 'loading' } };
    if (next.transcript.entries !== this.state.snapshot.transcript.entries)
      this.pacing.noteChange();
    this.setSnapshot(next);
    if (next.phase.type === 'following') this.outputs.flush();
    const linked = next.transcript.links.continuedInSessionID;
    if (linked && this.followed && linked !== this.followed.sessionID)
      this.followContinuation(linked);
  }

  /** The program continued the conversation in a session of its own (compaction into a new file). */
  private followContinuation(sessionID: string): void {
    const resolved = continuationOf(this.followed, sessionID);
    if (!resolved) return;
    this.continued = resolved;
    this.bind(this.options.agent());
  }

  private setSnapshot(snapshot: ConversationState['snapshot']): void {
    this.commit({ ...this.state, snapshot });
  }

  private setProgress(progress: Record<string, ChatWorkflowProgress>): void {
    if (JSON.stringify(progress) === JSON.stringify(this.state.workflowProgress)) return;
    this.commit({ ...this.state, workflowProgress: progress });
  }

  private setOutput(id: string, output: ChatOutputState): void {
    const outputs = new Map(this.state.outputs);
    outputs.set(id, output);
    this.commit({ ...this.state, outputs });
  }

  private setReadFailure(thrown: unknown): void {
    this.setSnapshot({ ...this.state.snapshot, readFailure: asTransportError(thrown) });
  }

  private commit(next: ConversationState): void {
    this.state = { ...next, version: this.state.version + 1 };
    for (const listener of [...this.listeners]) listener();
  }
}
