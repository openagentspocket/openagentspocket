// One conversation's transcript on its Host (Swift ChatConversationEngine): finds the file and
// follows it, feeds the program's reducer and keeps what it showed in the device cache.
//
// The owner makes one call at a time and waits for it: each call may read the Host several times,
// and a second call interleaved at one of those awaits would follow the file from a stale offset.
// `output` is the exception: it changes nothing, so it may run alongside.

import { asTransportError } from '../../errors';
import { decodeUtf8 } from '../../events/utf8';
import { loadCurrent, makeCacheDocument } from '../model/cache';
import { readBytes } from '../model/host-files';
import {
  capPreview,
  MAXIMUM_FETCH_BYTES,
  PREVIEW_EXPANDED_LIMITS,
  withExpandedLimits,
} from '../model/preview';
import { listedBackgroundWork, recordedEntries } from '../model/transcript';
import {
  type ChatProjectionContext,
  type ChatToolActivity,
  type ChatToolPreview,
  emptyTranscript,
} from '../model/types';
import type { ChatWorkflowProgress } from '../model/workflow-progress';
import { ChatEngineBase, type ChatExpandedOutput, isCancelled } from './engine-base';
import type { ChatConversationSnapshot, ChatToolOutputFailure } from './snapshot';

export type { ChatEngineOptions, ChatExpandedOutput } from './engine-base';

export class ChatConversationEngine extends ChatEngineBase {
  /** Shows what the device kept from an earlier visit, before the Host answers. */
  async restore(): Promise<ChatConversationSnapshot> {
    const result = await loadCurrent(this.cache, this.cacheKey, this.adapter.revision);
    if (result.type === 'hit') {
      const document = result.document;
      this.cached = document;
      this.update((next) => {
        next.transcript = {
          ...emptyTranscript(),
          entries: document.entries,
          title: document.title,
          needsOlderHistory: !document.reachedStart,
          backgroundWork: document.backgroundWork ?? [],
          latestPromptOffset: document.latestPromptOffset,
          turns: document.turns ?? [],
        };
        next.readOffset = document.coverageEnd;
        next.isFromCache = document.entries.length > 0;
        next.older = { type: document.reachedStart ? 'reachedStart' : 'available' };
      });
    }
    return this.current;
  }

  /**
   * Finds the transcript and reads its tail. `directories` are where the Agent runs and was
   * launched, most current first. `lostAMessage` says a message delivered to the Agent went
   * unrecorded past its echo timeout.
   */
  async open(
    directories: string[],
    context: ChatProjectionContext,
    lostAMessage = false,
  ): Promise<ChatConversationSnapshot> {
    this.directories = directories;
    this.lostAMessage = lostAMessage;
    this.setContext(context);
    try {
      const location = await this.locate();
      if (location.type === 'found') await this.follow(location.path);
      else this.stop(location.reason);
    } catch (thrown) {
      this.recordFailure(thrown);
    }
    this.projectIfNeeded();
    return this.current;
  }

  /** Reads what the program appended since the last look. Without a source it changes nothing. */
  async poll(context: ChatProjectionContext): Promise<ChatConversationSnapshot> {
    this.setContext(context);
    const source = this.source;
    if (source) {
      try {
        const change = await source.poll(this.files);
        switch (change.type) {
          case 'unchanged':
            break;
          case 'appended':
            this.reducer?.append(change.lines);
            this.needsProjection = true;
            break;
          case 'reset':
            await this.start(source, change.lines);
            break;
          case 'missing':
            // Claude moves a session's file on `/cd`, Codex on archive: look again, keeping what shows.
            return await this.open(this.directories, context);
        }
        this.update((next) => {
          next.readFailure = null;
        });
      } catch (thrown) {
        this.recordFailure(thrown);
      }
    }
    this.projectIfNeeded();
    return this.current;
  }

  /**
   * Looks for the transcript again, then reads it: a Codex undo continues the thread in a new
   * `_<rollout>` file and leaves the one followed unchanged, so a poll alone would never show the
   * turns written since. Follows the new file when the live one moved, else polls. Other programs
   * only poll.
   */
  async relocate(context: ChatProjectionContext): Promise<ChatConversationSnapshot> {
    const current = this.source?.path;
    if (this.reference.program !== 'codex' || current === undefined) return this.poll(context);
    this.setContext(context);
    try {
      const location = await this.locate();
      if (location.type === 'found' && location.path !== current) {
        await this.follow(location.path);
        this.projectIfNeeded();
        return this.current;
      }
    } catch (thrown) {
      this.recordFailure(thrown);
      this.projectIfNeeded();
      return this.current;
    }
    return this.poll(context);
  }

  /**
   * Reads history above the oldest line read, a page at a time, until it brings the opener of a
   * turn not shown before, the file's head or the saved entries are reached, or the request's
   * search is spent. A turn's steps fold under its header, so pages that end inside a turn would
   * add nothing to see. Once the file's head is loaded, a Codex conversation continued from an
   * older rollout reads that base next.
   */
  async loadOlder(
    context: ChatProjectionContext,
    automatic = false,
  ): Promise<ChatConversationSnapshot> {
    this.setContext(context);
    const first = this.source;
    if (
      !first ||
      !(first.hasOlder || this.baseNeeded()) ||
      this.olderUnreadable ||
      (automatic && this.current.olderAwaitsUser)
    ) {
      return this.current;
    }
    this.update((next) => {
      next.older = { type: 'loading' };
    });
    const oldestOpener = this.current.transcript.turns[0]?.firstEntryID;
    first.beginOlderSearch();
    const { first: firstPage, maximum } = first.olderPageLengths;
    let pageLength = firstPage;
    // What a bounded automatic request may still read; every byte counts, page overlaps included.
    const bound = automatic ? first.limits.automaticOlderSearch : null;
    let allowance = bound;
    for (;;) {
      const source = this.source;
      if (!source) break;
      const limit = allowance === null ? null : Math.min(pageLength, allowance);
      if (allowance !== null) allowance -= limit ?? 0;
      try {
        if (source.hasOlder) {
          const page = await source.loadOlder(this.files, limit ?? pageLength, limit);
          switch (page.type) {
            case 'lines':
              this.reducer?.prepend(page.lines);
              break;
            case 'headReached':
              break;
            case 'unreadable':
              this.olderUnreadable = true;
              break;
            case 'beyondLimit':
              // A line longer than this page; the next is larger.
              break;
            case 'missing':
            case 'rewritten':
              return await this.open(this.directories, context);
          }
        } else {
          await this.supplyBase();
        }
        this.needsProjection = true;
        this.update((next) => {
          next.readFailure = null;
        });
      } catch (thrown) {
        this.recordFailure(thrown);
        if (!isCancelled(thrown)) {
          const error = asTransportError(thrown);
          this.update((next) => {
            next.older = { type: 'failed', error };
          });
        }
        break;
      }
      this.projectIfNeeded();
      pageLength = Math.min(pageLength * 2, maximum);
      const still = this.source;
      if (
        this.current.transcript.turns[0]?.firstEntryID !== oldestOpener ||
        this.current.older.type === 'reachedStart' ||
        !still ||
        !(still.hasOlder || this.baseNeeded()) ||
        this.olderUnreadable ||
        still.olderSearchExhausted
      ) {
        break;
      }
      if (allowance === 0) {
        // Further pages would only grow the turn's run of steps.
        this.update((next) => {
          next.olderAwaitsUser = true;
        });
        break;
      }
    }
    if (this.current.transcript.turns[0]?.firstEntryID !== oldestOpener) {
      this.update((next) => {
        next.olderAwaitsUser = false;
      });
    }
    this.projectIfNeeded();
    return this.current;
  }

  /** Projects again without reading, for a change only the context carries (the Agent's activity). */
  reproject(context: ChatProjectionContext): ChatConversationSnapshot {
    this.setContext(context);
    this.projectIfNeeded();
    return this.current;
  }

  /** Saves what shows, at most once per save interval unless `force`. */
  async save(force = false): Promise<void> {
    const entries = recordedEntries(this.current.transcript);
    const phase = this.current.phase;
    const source = this.source;
    if (phase.type !== 'following' || !source || !source.head || entries.length === 0) return;
    const at = this.now();
    if (this.lastSave) {
      if (this.lastSave.revision === this.current.revision) return;
      if (!force && at - this.lastSave.at < this.saveIntervalMs) return;
    }
    const windowStart = source.windowStart ?? source.readOffset;
    const joined = this.joinedCache(windowStart);
    const coverageStart = joined ? Math.min(joined.coverageStart, windowStart) : windowStart;
    const document = makeCacheDocument({
      key: this.cacheKey,
      adapterRevision: this.adapter.revision,
      transcriptPath: phase.path,
      head: source.head,
      coverageStart,
      coverageEnd: source.readOffset,
      reachedStart:
        ((joined?.reachedStart ?? windowStart === 0) && !this.baseNeeded()) || this.olderUnreadable,
      title: this.current.transcript.title,
      entries,
      savedAt: new Date(at).toISOString(),
      backgroundWork: listedBackgroundWork(this.current.transcript),
      latestPromptOffset: this.current.transcript.latestPromptOffset,
      turns: this.current.transcript.turns,
    });
    await this.cache.save(document);
    // What was just saved fills in above a later window: a moved file's fresh tail, or a rewrite's.
    this.cached = document;
    this.lastSave = { revision: this.current.revision, at };
  }

  /**
   * Reads the journals of the Workflows the transcript lists and returns what each shows by the
   * Workflow's id. Only while the transcript itself reads.
   */
  async followWorkflows(): Promise<Record<string, ChatWorkflowProgress>> {
    const { phase, isFromCache, readFailure } = this.current;
    if (phase.type !== 'following' || isFromCache || readFailure) return this.workflows.progress;
    return this.workflows.follow(this.current.transcript, this.files, this.now());
  }

  /**
   * A tool's output read again for an expanded row: the line its row references, decoded up to
   * the expanded limits, or the start of the file the program moved a long output to.
   */
  async output(
    tool: ChatToolActivity,
  ): Promise<
    { ok: true; output: ChatExpandedOutput } | { ok: false; failure: ChatToolOutputFailure }
  > {
    const reference = tool.output;
    const { reducer, source } = this;
    if (!reference || !reducer || !source) return { ok: false, failure: { type: 'notFollowing' } };
    if (reference.length > MAXIMUM_FETCH_BYTES) return { ok: false, failure: { type: 'tooLong' } };
    try {
      const line = await source.line(reference, this.files);
      if (!line) return { ok: false, failure: { type: 'gone' } };
      const output = withExpandedLimits(() => reducer.output(line, tool));
      if (!output) return { ok: false, failure: { type: 'gone' } };
      if (output.type === 'preview') {
        return { ok: true, output: { preview: output.preview, fileChanges: output.fileChanges } };
      }
      const spilled = await this.spilledOutput(output.path);
      return {
        ok: true,
        output: { preview: spilled ?? output.fallback, fileChanges: output.fileChanges },
      };
    } catch (thrown) {
      return { ok: false, failure: { type: 'unreadable', error: asTransportError(thrown) } };
    }
  }

  /** The start of a file a long output was moved to; null when the file is gone. */
  private async spilledOutput(path: string): Promise<ChatToolPreview | null> {
    // A few bytes past the cap say whether there is more, and keep a cut character out of what shows.
    const data = await readBytes(this.files, path, 0, PREVIEW_EXPANDED_LIMITS.bytes + 4, 256 << 10);
    return data === null ? null : capPreview(decodeUtf8(data), 0, PREVIEW_EXPANDED_LIMITS);
  }
}
