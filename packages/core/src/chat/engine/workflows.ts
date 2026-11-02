// Follows the journals of the Workflows a transcript lists, a few per call and within a budget
// (the Workflows section of Swift ChatConversationEngine). Never throws and never changes the
// snapshot: a journal that cannot be read only stops showing progress.

import { asTransportError } from '../../errors';
import { ClaudeWorkflowJournal } from '../claude/workflow-journal';
import type { ChatHostFiles } from '../model/host-files';
import { type JournalLimits, WorkflowJournalFollower } from '../model/journal-follower';
import { listedBackgroundWork } from '../model/transcript';
import type { ChatTranscript } from '../model/types';
import type { ChatWorkflowProgress } from '../model/workflow-progress';

export interface WorkflowLimits {
  follower: Partial<JournalLimits>;
  /** The most one journal reads in one call. */
  journalBudget: number;
  /** The most all journals read in one call. */
  callBudget: number;
  /** How many journals are looked at per call, least recently looked at first. */
  journalsPerCall: number;
  /** Waits (ms) after a failed look at a journal, one per failure; the last repeats. */
  backoffMs: number[];
}

export const DEFAULT_WORKFLOW_LIMITS: WorkflowLimits = {
  follower: {},
  journalBudget: 128 << 10,
  callBudget: 256 << 10,
  journalsPerCall: 2,
  backoffMs: [2000, 4000, 8000, 16_000, 30_000],
};

interface FollowedJournal {
  follower: WorkflowJournalFollower;
  journal: ClaudeWorkflowJournal;
  /** The journal as of the last time it was read to its end, so counts never climb through a first read. */
  progress: ChatWorkflowProgress | null;
  lastLook: number;
  failures: number;
  nextLook: number | null;
  /** Read to its end after the Workflow ended: nothing more comes. */
  isSettled: boolean;
  /** Too large, or the Host refuses it: not looked at again. */
  isUnreadable: boolean;
}

export class WorkflowFollowers {
  private readonly journals = new Map<string, FollowedJournal>();
  private calls = 0;

  constructor(private readonly limits: WorkflowLimits = DEFAULT_WORKFLOW_LIMITS) {}

  get progress(): Record<string, ChatWorkflowProgress> {
    const out: Record<string, ChatWorkflowProgress> = {};
    for (const [id, followed] of this.journals) if (followed.progress) out[id] = followed.progress;
    return out;
  }

  async follow(
    transcript: ChatTranscript,
    files: ChatHostFiles,
    now: number,
  ): Promise<Record<string, ChatWorkflowProgress>> {
    const listedWork = listedBackgroundWork(transcript);
    const listed = new Map<string, string>();
    for (const item of listedWork) {
      if (item.kind === 'workflow' && item.journalPath) listed.set(item.id, item.journalPath);
    }
    for (const [id, followed] of [...this.journals]) {
      if (listed.get(id) !== followed.follower.path) this.journals.delete(id);
    }
    for (const [id, path] of listed) {
      if (!this.journals.has(id)) {
        this.journals.set(id, {
          follower: new WorkflowJournalFollower(path, this.limits.follower),
          journal: new ClaudeWorkflowJournal(),
          progress: null,
          lastLook: 0,
          failures: 0,
          nextLook: null,
          isSettled: false,
          isUnreadable: false,
        });
      }
    }
    const running = new Set(listedWork.filter((i) => i.state === 'running').map((i) => i.id));
    this.calls += 1;
    const due = [...this.journals]
      .filter(
        ([, f]) => !f.isSettled && !f.isUnreadable && (f.nextLook === null || now >= f.nextLook),
      )
      .sort(([ia, a], [ib, b]) => a.lastLook - b.lastLook || (ia < ib ? -1 : ia > ib ? 1 : 0))
      .slice(0, this.limits.journalsPerCall);
    let budget = this.limits.callBudget;
    for (const [id, followed] of due) {
      if (budget <= 0) break;
      followed.lastLook = this.calls;
      const before = followed.follower.readOffset;
      try {
        const change = await followed.follower.poll(
          files,
          Math.min(budget, this.limits.journalBudget),
        );
        const after = followed.follower.readOffset;
        budget -= after >= before ? after - before : after;
        if (change.type === 'missing') {
          // Whatever showed stays, and ages toward stale.
          this.backOff(followed, now);
          continue;
        }
        if (change.type === 'appended') followed.journal.apply(change.lines);
        else if (change.type === 'restarted') {
          followed.journal = new ClaudeWorkflowJournal();
          followed.journal.apply(change.lines);
        } else if (change.type === 'tooLarge') followed.isUnreadable = true;
        followed.failures = 0;
        followed.nextLook = null;
        if (followed.follower.isCaughtUp) {
          const modified = followed.follower.modificationTime;
          followed.progress = followed.journal.progress(
            modified === null ? null : new Date(modified * 1000).toISOString(),
          );
          // One last read to its end after the Workflow ended.
          if (!running.has(id)) followed.isSettled = true;
        }
      } catch (thrown) {
        const error = asTransportError(thrown);
        if (error.kind === 'cancelled') return this.progress;
        if (error.kind === 'hostFileUnreadable') followed.isUnreadable = true;
        else this.backOff(followed, now);
      }
    }
    return this.progress;
  }

  private backOff(followed: FollowedJournal, now: number): void {
    const delays = this.limits.backoffMs;
    const delay =
      delays.length === 0 ? 0 : (delays[Math.min(followed.failures, delays.length - 1)] ?? 0);
    followed.failures += 1;
    followed.nextLook = now + delay;
  }
}
