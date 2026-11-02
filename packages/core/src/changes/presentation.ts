import { displayText } from './bytes';
import type { Say } from './say';
import type {
  ChangedFile,
  ChangesReadReason,
  ChangesTotals,
  CheckoutChanges,
  CheckoutHead,
  CheckoutLocation,
  CheckoutUpstream,
  FileKind,
  LimitNotice,
  LineCounts,
  Staging,
} from './types';

/** The most files the list shows; the model keeps every complete record. */
export const DISPLAY_LIMIT = 2_000;

/** Source Control order: conflicts first, then staged, working-tree changes, untracked. */
export type ChangesFileGroup = 'conflicts' | 'staged' | 'changes' | 'untracked';
export const FILE_GROUPS: readonly ChangesFileGroup[] = [
  'conflicts',
  'staged',
  'changes',
  'untracked',
];

export function fileGroup(file: ChangedFile): ChangesFileGroup {
  if (file.kind === 'conflicted') return 'conflicts';
  if (file.kind === 'untracked') return 'untracked';
  return file.staging === 'staged' ? 'staged' : 'changes';
}

export function groupTitle(group: ChangesFileGroup, say: Say): string {
  switch (group) {
    case 'conflicts':
      return say('Conflicts');
    case 'staged':
      return say('Staged');
    case 'changes':
      return say('Changes');
    case 'untracked':
      return say('Untracked');
  }
}

export interface ChangesFileSection {
  readonly group: ChangesFileGroup;
  readonly files: readonly ChangedFile[];
}

export function listedFiles(
  changes: CheckoutChanges,
  limit = DISPLAY_LIMIT,
): readonly ChangedFile[] {
  return changes.files.slice(0, limit);
}

/** The listed files in their groups, each keeping the files' order; empty groups left out. */
export function listedSections(
  changes: CheckoutChanges,
  limit = DISPLAY_LIMIT,
): ChangesFileSection[] {
  const files = listedFiles(changes, limit);
  return FILE_GROUPS.flatMap((group) => {
    const inGroup = files.filter((file) => fileGroup(file) === group);
    return inGroup.length > 0 ? [{ group, files: inGroup }] : [];
  });
}

/** Whether the limit is hit, and by how much. Shared with untracked-directory listings. */
export function limitNotice(
  shown: number,
  total: number,
  isLowerBound: boolean,
  noun: LimitNotice['noun'],
): LimitNotice | null {
  return shown < total || isLowerBound ? { shown, total, isLowerBound, noun } : null;
}

export function limitNoticeText(notice: LimitNotice, say: Say): string {
  if (notice.total === 0 && notice.isLowerBound) {
    return say("The Host's reply was truncated before any files could be listed.");
  }
  const { shown, total } = notice;
  if (notice.noun === 'changed files') {
    return notice.isLowerBound
      ? say('Showing %@ of more than %@ changed files.', shown, total)
      : say('Showing %@ of %@ changed files.', shown, total);
  }
  return notice.isLowerBound
    ? say('Showing %@ of more than %@ files.', shown, total)
    : say('Showing %@ of %@ files.', shown, total);
}

export function listLimitNotice(
  changes: CheckoutChanges,
  limit = DISPLAY_LIMIT,
): LimitNotice | null {
  return limitNotice(
    listedFiles(changes, limit).length,
    changes.files.length,
    changes.isStatusTruncated,
    'changed files',
  );
}

/** Nothing to commit, and the Host's status was read in full. */
export function isClean(changes: CheckoutChanges): boolean {
  return changes.files.length === 0 && !changes.isStatusTruncated;
}

// MARK: Files

export function kindTitle(kind: FileKind, say: Say): string {
  switch (kind) {
    case 'modified':
      return say('Modified');
    case 'added':
      return say('Added');
    case 'deleted':
      return say('Deleted');
    case 'renamed':
      return say('Renamed');
    case 'untracked':
      return say('Untracked');
    case 'conflicted':
      return say('Conflicted');
  }
}

/** One letter for the row's badge: `?` and `~` for untracked and conflicted, git's otherwise. */
export function kindSymbol(kind: FileKind): string {
  const symbols: Record<FileKind, string> = {
    modified: 'M',
    added: 'A',
    deleted: 'D',
    renamed: 'R',
    untracked: '?',
    conflicted: '~',
  };
  return symbols[kind];
}

export function stagingTitle(staging: Staging, say: Say): string {
  if (staging === 'staged') return say('Staged');
  return staging === 'unstaged' ? say('Unstaged') : say('Staged and unstaged');
}

export function filePath(file: ChangedFile): string {
  return displayText(file.path);
}

export function fileOriginalPath(file: ChangedFile): string | null {
  return file.originalPath === null ? null : displayText(file.originalPath);
}

function splitPath(path: string): { directory: string; name: string } {
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
  const slash = trimmed.lastIndexOf('/');
  if (slash < 0) return { directory: '', name: path };
  return { directory: trimmed.slice(0, slash), name: path.slice(slash + 1) };
}

/** The last path component. A directory keeps its trailing slash. */
export function fileName(file: ChangedFile): string {
  return splitPath(filePath(file)).name;
}

/** The path's directory, empty at the top level. */
export function fileDirectory(file: ChangedFile): string {
  return splitPath(filePath(file)).directory;
}

/** "Modified · Staged", "Renamed from old.txt · Staged", "Untracked". */
export function fileDetail(file: ChangedFile, say: Say): string {
  const original = fileOriginalPath(file);
  const parts = [
    original === null
      ? kindTitle(file.kind, say)
      : say('%@ from %@', kindTitle(file.kind, say), original),
  ];
  if (file.staging) parts.push(stagingTitle(file.staging, say));
  return parts.join(' · ');
}

/**
 * Beside the row's name: where a rename came from, then the directory ("From CartError.swift ·
 * Sources/Checkout"). Null for a top-level file that was not renamed.
 */
export function fileRowDetail(file: ChangedFile, say: Say): string | null {
  const original = fileOriginalPath(file);
  const directory = fileDirectory(file);
  if (original === null) return directory === '' ? null : directory;
  const from = splitPath(original);
  if (from.name === fileName(file) && from.directory !== '' && directory !== '') {
    return `${from.directory} → ${directory}`;
  }
  const source = from.directory === directory ? from.name : original;
  return [say('From %@', source), ...(directory === '' ? [] : [directory])].join(' · ');
}

/** An untracked directory collapsed to one status row. */
export function isUntrackedDirectory(file: ChangedFile): boolean {
  return file.kind === 'untracked' && file.path.endsWith('/');
}

export function lineCountsSummary(counts: LineCounts, say: Say): string {
  return counts.kind === 'binary'
    ? say('Binary')
    : say('+%@ −%@ lines', counts.added, counts.removed);
}

// MARK: Header

export function branchTitle(head: CheckoutHead, say: Say): string {
  if (head.branch.kind === 'named') return head.branch.name;
  return say('Detached at %@', head.commit?.slice(0, 7) ?? say('unknown commit'));
}

/** The Checkout's last path component. */
export function checkoutName(checkout: CheckoutLocation): string {
  const component = checkout.displayPath
    .split('/')
    .filter((part) => part !== '')
    .at(-1);
  return component ?? checkout.displayPath;
}

export function upstreamSummary(upstream: CheckoutUpstream, say: Say): string {
  const { state, name } = upstream;
  if (state.kind === 'tracking')
    return say('%@: %@ ahead, %@ behind', name, state.ahead, state.behind);
  return state.kind === 'deleted'
    ? say('Upstream %@ was deleted', name)
    : say('Upstream %@, comparison unavailable', name);
}

export interface CommitAge {
  readonly unit: 'minute' | 'hour' | 'day';
  readonly count: number;
}

/**
 * A relative age for the app's locale-aware formatter; null reads as "just now", which also
 * covers a timestamp ahead of the device clock.
 */
export function commitAge(committedAt: number, now: number): CommitAge | null {
  const seconds = Math.floor((now - committedAt) / 1000);
  if (seconds < 59) return null;
  const units: [CommitAge['unit'], number][] = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (seconds >= size) return { unit, count: Math.floor(seconds / size) };
  }
  return null;
}

// MARK: Totals

export function filesSummary(totals: ChangesTotals, say: Say, moreThan = false): string {
  const count = totals.trackedFiles;
  if (moreThan) {
    return count === 1
      ? say('more than %@ file changed', count)
      : say('more than %@ files changed', count);
  }
  return count === 1 ? say('%@ file changed', count) : say('%@ files changed', count);
}

export function untrackedSummary(totals: ChangesTotals, say: Say, moreThan = false): string {
  const count = totals.untrackedItems;
  if (moreThan) {
    return count === 1
      ? say('more than %@ untracked item', count)
      : say('more than %@ untracked items', count);
  }
  return count === 1 ? say('%@ untracked item', count) : say('%@ untracked items', count);
}

/**
 * Git lists every tracked entry before the untracked ones, so a capped status loses untracked
 * items first. Once one untracked item is listed, the tracked count is whole and the untracked
 * count a lower bound; with none listed, the tracked count is the lower bound.
 */
export function spokenFiles(totals: ChangesTotals, statusTruncated: boolean, say: Say): string {
  return filesSummary(totals, say, statusTruncated && totals.untrackedItems === 0);
}

export function spokenUntracked(totals: ChangesTotals, statusTruncated: boolean, say: Say): string {
  if (!statusTruncated) return untrackedSummary(totals, say);
  return totals.untrackedItems > 0
    ? untrackedSummary(totals, say, true)
    : say('untracked items not counted');
}

// MARK: Failures

export function readFailureMessage(reason: ChangesReadReason, say: Say): string {
  switch (reason.kind) {
    case 'unavailable':
      return say("This connection can't read Changes.");
    case 'notAGitWorkingTree':
      return say("This directory isn't inside a git working tree.");
    case 'incomplete':
      return say("The Host's reply ended early, so these Changes may be incomplete.");
    case 'gitFailed':
      return reason.line;
    case 'gitMissing':
      return say(
        "Git couldn't be run on this Host. Install git and make it available to the SSH account.",
      );
    case 'gitTooOld':
      return say('This Host has git %@. Changes requires git 2.17 or later.', reason.version);
    case 'notOwnedByAccount':
      return say(
        "Git's ownership protection refused this Checkout because it belongs to another user account on the Host. Agentico doesn't bypass that protection.",
      );
    case 'directoryMissing':
      return say('This directory no longer exists on the Host.');
    case 'lineBreakInPath':
      return say("The Checkout's path contains a line break, which Changes can't read.");
  }
}

/** The title shown above a failure's message, by failure kind. */
export function readFailureTitle(reason: ChangesReadReason, say: Say): string {
  switch (reason.kind) {
    case 'notAGitWorkingTree':
      return say('Not a Git Working Tree');
    case 'gitMissing':
      return say('Git Not Found');
    case 'gitTooOld':
      return say('Git Version Too Old');
    case 'notOwnedByAccount':
      return say('Checkout Ownership Protected');
    case 'directoryMissing':
      return say('Directory No Longer Exists');
    case 'incomplete':
      return say('Incomplete Changes');
    default:
      return say("Couldn't Read Changes");
  }
}
