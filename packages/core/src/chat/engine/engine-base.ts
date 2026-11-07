// One conversation's transcript on its Host (Swift ChatConversationEngine): finds the file and
// follows it, feeds the program's reducer and keeps what it showed in the device cache.
//
// The owner makes one call at a time and waits for it: each call may read the Host several times,
// and a second call interleaved at one of those awaits would follow the file from a stale offset.
// `output` is the exception: it changes nothing, so it may run alongside.

import { asTransportError, type TransportError } from '../../errors';
import { decodeBase64 } from '../../hosts/text';
import type { CodexRolloutSegment } from '../codex/locator';
import type { ChatCacheDocument, ChatCacheKey, ChatTranscriptCache } from '../model/cache';
import type { ConversationReference } from '../model/conversation-reference';
import { sameConversationHeads, TranscriptFollower } from '../model/follower';
import { type ChatHostFiles, readBytes, readFirstLine } from '../model/host-files';
import { type ChatLine, frameLines } from '../model/lines';
import { openQuestions } from '../model/open-questions';
import type { ChatTranscriptReducer } from '../model/reducer';
import { ChatSourceUnavailable, type ChatTranscriptSource } from '../model/source';
import { carryBackgroundWork } from '../model/transcript';
import {
  type ChatFileChanges,
  type ChatProjectionContext,
  type ChatToolPreview,
  type ChatTranscript,
  projectionContext,
} from '../model/types';
import type { ChatUnavailableReason } from '../timeline/reasons';
import type { ChatTranscriptAdapter } from './adapter';
import { locateTranscript } from './locate';
import { type ChatConversationSnapshot, initialSnapshot } from './snapshot';
import { DEFAULT_WORKFLOW_LIMITS, WorkflowFollowers, type WorkflowLimits } from './workflows';

export interface ChatExpandedOutput {
  preview: ChatToolPreview | null;
  fileChanges: ChatFileChanges | null;
}

export interface ChatEngineOptions {
  reference: ConversationReference;
  cacheKey: ChatCacheKey;
  files: ChatHostFiles;
  cache: ChatTranscriptCache;
  adapter: ChatTranscriptAdapter;
  /** The Host's Claude Account directories as Usage last read them; never reads the Host. */
  accountDirectories?: () => Promise<string[]>;
  /** How often entries that keep changing are saved. */
  saveIntervalMs?: number;
  workflowLimits?: WorkflowLimits;
  /** Unix milliseconds. */
  now?: () => number;
  /** The largest base rollout a reverted Codex conversation reads. */
  maximumBaseBytes?: number;
}

const DEFAULT_SAVE_INTERVAL_MS = 10_000;
const DEFAULT_MAXIMUM_BASE_BYTES = 32 << 20;

export function isCancelled(error: unknown): boolean {
  return asTransportError(error).kind === 'cancelled';
}

export abstract class ChatEngineBase {
  readonly reference: ConversationReference;
  readonly cacheKey: ChatCacheKey;
  protected readonly files: ChatHostFiles;
  protected readonly cache: ChatTranscriptCache;
  protected readonly adapter: ChatTranscriptAdapter;
  protected readonly accountDirectories: () => Promise<string[]>;
  protected readonly saveIntervalMs: number;
  protected readonly now: () => number;
  protected readonly maximumBaseBytes: number;
  protected readonly workflows: WorkflowFollowers;

  protected directories: string[] = [];
  protected relocatedDirectory: string | null = null;
  protected source: ChatTranscriptSource | null = null;
  protected reducer: ChatTranscriptReducer | null = null;
  /** The thread's rollout files (Codex), where history bases are found. */
  protected segments: CodexRolloutSegment[] = [];
  protected hasFollowed = false;
  protected newConversationActivity: ChatProjectionContext['activity'] | null = null;
  protected lostAMessage = false;
  /** The document last restored or saved. Its entries older than the live window show above it. */
  protected cached: ChatCacheDocument | null = null;
  protected olderUnreadable = false;
  protected context: ChatProjectionContext = projectionContext();
  protected needsProjection = false;
  protected current: ChatConversationSnapshot = initialSnapshot();
  protected lastSave: { revision: number; at: number } | null = null;

  constructor(options: ChatEngineOptions) {
    this.reference = options.reference;
    this.cacheKey = options.cacheKey;
    this.files = options.files;
    this.cache = options.cache;
    this.adapter = options.adapter;
    this.accountDirectories = options.accountDirectories ?? (async () => []);
    this.saveIntervalMs = options.saveIntervalMs ?? DEFAULT_SAVE_INTERVAL_MS;
    this.now = options.now ?? (() => Date.now());
    this.maximumBaseBytes = options.maximumBaseBytes ?? DEFAULT_MAXIMUM_BASE_BYTES;
    this.workflows = new WorkflowFollowers(options.workflowLimits ?? DEFAULT_WORKFLOW_LIMITS);
  }

  get snapshot(): ChatConversationSnapshot {
    return this.current;
  }

  // MARK: Following

  protected async locate() {
    const location = await locateTranscript({
      reference: this.reference,
      files: this.files,
      now: this.now,
      directories: this.directories,
      relocatedDirectory: this.relocatedDirectory,
      lostAMessage: this.lostAMessage,
      awaitingFirstMessage:
        this.current.phase.type === 'unavailable' &&
        this.current.phase.reason.kind === 'awaitingFirstMessage',
      activity: this.context.activity,
      newConversationActivity: this.newConversationActivity,
      accountDirectories: await this.accountDirectories(),
      hasHistory: this.hasFollowed || this.cached !== null,
    });
    this.newConversationActivity = location.newConversationActivity;
    if (location.type === 'found') this.segments = location.segments;
    return location;
  }

  protected async follow(path: string): Promise<void> {
    await this.followSource(
      new TranscriptFollower(path, this.adapter.limits, this.adapter.identity),
    );
  }

  /** Follows a source the adapter makes (a store read by query), or stops with why there is none. */
  protected async followQuery(): Promise<void> {
    const source = this.adapter.makeRecordSource?.(this.reference.sessionID) ?? null;
    if (source) await this.followSource(source);
    else this.stop({ kind: 'unidentifiedSession', program: this.reference.program });
  }

  protected async followSource(source: ChatTranscriptSource): Promise<void> {
    const lines = await source.open(this.files);
    if (lines) await this.start(source, lines);
    else this.stop({ kind: 'notFound', searchedAll: true });
  }

  /** Stops following for a reason a source named, or records any other failure. */
  protected stopOrRecord(thrown: unknown): void {
    if (thrown instanceof ChatSourceUnavailable) this.stop(thrown.reason);
    else this.recordFailure(thrown);
  }

  /** Starts over on a freshly opened source: a new reducer over its tail window. */
  protected async start(source: ChatTranscriptSource, lines: ChatLine[]): Promise<void> {
    const reducer = this.adapter.makeReducer({
      path: source.path,
      firstLine: await this.firstLine(source),
    });
    reducer.append(lines);
    if (reducer.unsupportedFormat !== null) {
      this.stop({ kind: 'unsupportedFormat', format: reducer.unsupportedFormat });
      return;
    }
    let movedLayout = this.hasFollowed || this.current.readOffset > source.readOffset;
    const cached = this.cached;
    if (cached && !this.sameConversation(cached, source)) {
      // Another conversation now has this name.
      this.cached = null;
      this.lastSave = null;
      movedLayout = true;
      await this.cache.remove(this.cacheKey);
    }
    this.source = source;
    this.reducer = reducer;
    this.hasFollowed = true;
    this.olderUnreadable = false;
    this.needsProjection = true;
    this.update((next) => {
      next.phase = { type: 'following', path: source.path };
      next.readFailure = null;
      next.isFromCache = false;
      // A fresh tail loads earlier messages by itself again.
      next.olderAwaitsUser = false;
      if (movedLayout) next.layoutGeneration += 1;
    });
  }

  protected sameConversation(document: ChatCacheDocument, source: ChatTranscriptSource): boolean {
    return sameConversationHeads(decodeBase64(document.head), source.head, this.adapter.identity);
  }

  /** A tail window that starts past the file's first line still needs it when the records depend on it. */
  protected async firstLine(source: ChatTranscriptSource): Promise<ChatLine | null> {
    if (!this.adapter.wantsFirstLine || source.windowStart === 0) return null;
    const first = await readFirstLine(this.files, source.path, 64 << 10, 1 << 20);
    if (first?.type !== 'line') return null;
    return { offset: 0, length: first.data.length, data: first.data };
  }

  /** Stops following, keeping whatever shows. */
  protected stop(reason: ChatUnavailableReason): void {
    this.source = null;
    this.reducer = null;
    this.update((next) => {
      next.phase = { type: 'unavailable', reason };
      next.readFailure = null;
      next.isFromCache = next.transcript.entries.length > 0;
    });
  }

  // MARK: History bases

  protected baseNeeded(): boolean {
    return this.reducer !== null && this.adapter.pendingBase(this.reducer) !== null;
  }

  /**
   * Reads the base rollout the reducer names next, `[0, end_byte_offset)` of its file, and hands
   * it over. A base that is missing, too large or unreadable is handed over empty, which ends the
   * lineage with older history shown as unavailable.
   */
  protected async supplyBase(): Promise<void> {
    const reducer = this.reducer;
    const base = reducer ? this.adapter.pendingBase(reducer) : null;
    if (!reducer || !base) return;
    const segment = this.segments.find((candidate) => candidate.name.rolloutID === base.rolloutID);
    let lines: ChatLine[] = [];
    if (segment && base.endByteOffset <= this.maximumBaseBytes) {
      const data = await readBytes(this.files, segment.path, 0, base.endByteOffset, 256 << 10);
      if (data !== null && data.length === base.endByteOffset) lines = frameLines(data);
    }
    this.adapter.supplyBase(reducer, base, segment?.path ?? '', lines);
  }

  // MARK: Projecting

  protected setContext(context: ChatProjectionContext): void {
    const same =
      context.activity === this.context.activity &&
      context.skillNames.size === this.context.skillNames.size &&
      [...context.skillNames].every((name) => this.context.skillNames.has(name));
    if (same) return;
    this.context = context;
    this.needsProjection = true;
  }

  /** The saved document when its entries continue the live window without a gap. */
  protected joinedCache(windowStart: number): ChatCacheDocument | null {
    const cached = this.cached;
    if (
      !this.adapter.joinsCachedHistory ||
      !cached ||
      windowStart <= 0 ||
      cached.coverageEnd < windowStart ||
      cached.coverageStart >= windowStart
    ) {
      return null;
    }
    return cached;
  }

  /** Rebuilds the transcript from the reducer, after the saved entries the live window has not reached. */
  protected projectIfNeeded(): void {
    const { reducer, source } = this;
    if (!this.needsProjection || !reducer || !source) return;
    this.needsProjection = false;
    const windowStart = source.windowStart ?? source.readOffset;
    let transcript: ChatTranscript = reducer.transcript({ ...this.context, windowStart });
    let reachedStart = windowStart === 0 && !this.baseNeeded();
    const joined = this.joinedCache(windowStart);
    if (joined) {
      const live = new Set(transcript.entries.map((entry) => entry.id));
      const earlier = joined.entries.filter(
        (entry) => entry.sourceOffset < windowStart && !live.has(entry.id),
      );
      const earlierIDs = new Set(earlier.map((entry) => entry.id));
      // Turns opened above the window, ahead of the ones it opens.
      const earlierTurns = (joined.turns ?? [])
        .filter((turn) => earlierIDs.has(turn.firstEntryID))
        .map((turn) => ({ ...turn }));
      const last = earlierTurns[earlierTurns.length - 1];
      const end = transcript.precedingTurnEnd;
      // The saved record of the turn the window opens inside may predate its end.
      if (end && last && last.ending !== 'interrupted') {
        last.ending = end.ending;
        last.endedAt = end.endedAt ?? last.endedAt;
      }
      transcript = {
        ...transcript,
        entries: [...earlier, ...transcript.entries],
        turns: [...earlierTurns, ...transcript.turns],
        title: transcript.title ?? joined.title,
        // The window's end belongs to the rows above the first turn only when the saved rows open none.
        precedingTurnEnd:
          joined.turns === null || earlierTurns.length > 0 ? null : transcript.precedingTurnEnd,
      };
      // Work launched above the window still runs, or ends in it.
      transcript = carryBackgroundWork(
        transcript,
        joined.backgroundWork ?? [],
        windowStart,
        joined.latestPromptOffset,
      );
      reachedStart = joined.reachedStart;
    } else if (this.olderUnreadable) {
      transcript = {
        ...transcript,
        entries: [
          {
            id: 'history-unavailable',
            sourceOffset: windowStart,
            content: { type: 'divider', value: { kind: 'historyUnavailable', detail: null } },
          },
          ...transcript.entries,
        ],
      };
      reachedStart = true;
    }
    if (transcript.links.relocatedCwd) this.relocatedDirectory = transcript.links.relocatedCwd;
    const asked = openQuestions(transcript, (activity) =>
      reducer.transcript({ ...this.context, activity, windowStart }),
    );
    this.update((next) => {
      next.transcript = transcript;
      next.openQuestions = asked;
      if (reachedStart) next.older = { type: 'reachedStart' };
      else if (next.older.type !== 'failed') next.older = { type: 'available' };
      next.readOffset = source.readOffset;
    });
  }

  protected recordFailure(thrown: unknown): void {
    if (isCancelled(thrown)) return;
    const error: TransportError = asTransportError(thrown);
    this.update((next) => {
      next.readFailure = error;
      if (next.older.type === 'loading') next.older = { type: 'available' };
    });
  }

  /** Applies a change and bumps the revision when something differs. */
  protected update(change: (next: ChatConversationSnapshot) => void): void {
    const next: ChatConversationSnapshot = {
      ...this.current,
      phase: this.current.phase,
      older: this.current.older,
    };
    change(next);
    const before = this.current;
    const same =
      next.transcript === before.transcript &&
      next.isFromCache === before.isFromCache &&
      next.olderAwaitsUser === before.olderAwaitsUser &&
      next.readOffset === before.readOffset &&
      next.layoutGeneration === before.layoutGeneration &&
      JSON.stringify(next.readFailure) === JSON.stringify(before.readFailure) &&
      JSON.stringify(next.phase) === JSON.stringify(before.phase) &&
      JSON.stringify(next.older) === JSON.stringify(before.older);
    if (same) return;
    next.revision = before.revision + 1;
    this.current = next;
  }
}
