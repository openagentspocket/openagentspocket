import type { ByteString } from './bytes';
import { parseDivergence } from './numstat';
import type {
  Branch,
  ChangedFile,
  CheckoutUpstream,
  FileKind,
  Staging,
  UpstreamState,
} from './types';

/** `git status --porcelain=v2 -z --branch`: NUL-terminated records keyed by their raw paths. */
export interface StatusReport {
  branch: Branch;
  /** `# branch.oid`; null while HEAD is unborn (`(initial)`). */
  commit: string | null;
  /** Conflicted files first, then by raw path bytes. */
  files: ChangedFile[];
  upstream: CheckoutUpstream | null;
  isUnborn: boolean;
}

interface TrackedEntry {
  path: ByteString;
  originalPath: ByteString | null;
  index: string;
  worktree: string;
}

export function makeFile(
  path: ByteString,
  kind: FileKind,
  options: { originalPath?: ByteString | null; staging?: Staging | null } = {},
): ChangedFile {
  return {
    path,
    originalPath: options.originalPath ?? null,
    kind,
    staging: options.staging ?? null,
    lineCounts: null,
  };
}

function staging(index: string, worktree: string): Staging | null {
  const staged = index !== '.';
  const unstaged = worktree !== '.';
  if (staged && unstaged) return 'both';
  if (staged) return 'staged';
  return unstaged ? 'unstaged' : null;
}

function trackedFile(entry: TrackedEntry): ChangedFile {
  let kind: FileKind = 'modified';
  if (entry.originalPath !== null) kind = 'renamed';
  else if (entry.index === 'A' || entry.worktree === 'A') kind = 'added';
  else if (entry.index === 'D' || entry.worktree === 'D') kind = 'deleted';
  return makeFile(entry.path, kind, {
    originalPath: entry.originalPath,
    staging: staging(entry.index, entry.worktree),
  });
}

/**
 * The record type's following `count` space-separated fields, then the rest of the record,
 * spaces included, as the path.
 */
function fields(record: ByteString, count: number): { fields: string[]; path: ByteString } | null {
  const found: string[] = [];
  let start = 0;
  for (let step = 0; step <= count; step++) {
    const space = record.indexOf(' ', start);
    if (space < 0) return null;
    found.push(record.slice(start, space));
    start = space + 1;
  }
  const path = record.slice(start);
  return path === '' ? null : { fields: found.slice(1), path };
}

function ordinaryEntry(record: ByteString): TrackedEntry | null {
  const parsed = fields(record, 7);
  const xy = parsed?.fields[0];
  if (!parsed || xy?.length !== 2) return null;
  return { path: parsed.path, originalPath: null, index: xy[0] ?? '.', worktree: xy[1] ?? '.' };
}

/**
 * `2 XY sub mH mI mW hH hI Xscore path` then the original path. `X` is `R` for a staged rename.
 * `Y` is `R` for a working-tree rename, which git detects only against an intent-to-add entry:
 * the new path reads as added and the original (`movedFrom`) as deleted from the working tree. A
 * copy leaves its original in place, so the new path reads as added.
 */
function renamedEntry(
  record: ByteString,
  originalPath: ByteString,
): { entry: TrackedEntry; movedFrom: ByteString | null } | null {
  const parsed = fields(record, 8);
  const xy = parsed?.fields[0];
  if (!parsed || xy?.length !== 2) return null;
  const index = xy[0] ?? '.';
  const worktree = xy[1] ?? '.';
  if (index === 'R') {
    return { entry: { path: parsed.path, originalPath, index, worktree }, movedFrom: null };
  }
  return {
    entry: {
      path: parsed.path,
      originalPath: null,
      index: index === 'C' ? 'A' : index,
      worktree: worktree === 'R' || worktree === 'C' ? 'A' : worktree,
    },
    movedFrom: worktree === 'R' ? originalPath : null,
  };
}

/**
 * The original paths of working-tree renames are still in the index but gone from the working
 * tree. One with a record of its own gains the deletion there (`RD`); any other becomes an
 * unstaged deletion (`.D`).
 */
function markDeletedFromWorkingTree(
  paths: readonly ByteString[],
  tracked: TrackedEntry[],
  others: readonly ChangedFile[],
): void {
  if (paths.length === 0) return;
  const positions = new Map<ByteString, number>();
  tracked.forEach((entry, position) => {
    positions.set(entry.path, position);
  });
  const otherPaths = new Set(others.map((file) => file.path));
  for (const path of paths) {
    const position = positions.get(path);
    if (position !== undefined) {
      const entry = tracked[position];
      if (entry) entry.worktree = 'D';
    } else if (!otherPaths.has(path)) {
      positions.set(path, tracked.length);
      tracked.push({ path, originalPath: null, index: '.', worktree: 'D' });
    }
  }
}

function applyHeader(
  record: string,
  report: StatusReport,
  state: { divergence: UpstreamState | null },
) {
  const value = (key: string) => (record.startsWith(key) ? record.slice(key.length) : null);
  const fallback = (): UpstreamState =>
    state.divergence ?? (report.isUnborn ? { kind: 'unknown' } : { kind: 'deleted' });
  const oid = value('# branch.oid ');
  const head = value('# branch.head ');
  const upstream = value('# branch.upstream ');
  const ab = value('# branch.ab ');
  if (oid !== null) {
    report.commit = oid === '(initial)' ? null : oid;
    report.isUnborn = oid === '(initial)';
    // Without HEAD, a missing branch.ab says nothing about whether the upstream exists. Also
    // handles an upstream header seen first.
    if (report.upstream) report.upstream = { ...report.upstream, state: fallback() };
  } else if (head !== null) {
    report.branch = head === '(detached)' ? { kind: 'detached' } : { kind: 'named', name: head };
  } else if (upstream !== null && upstream !== '') {
    report.upstream = { name: upstream, state: fallback() };
  } else if (ab !== null) {
    state.divergence = parseDivergence(ab);
    if (report.upstream) report.upstream = { ...report.upstream, state: state.divergence };
  }
}

/**
 * A body cut at its cap loses its last, partial record (and a rename whose original path was cut
 * off); every complete record is kept.
 */
export function parseStatus(body: ByteString): StatusReport {
  const records = body.split('\0');
  // Complete output ends in NUL, leaving an empty final element; a cut one ends inside a record.
  records.pop();
  const report: StatusReport = {
    branch: { kind: 'detached' },
    commit: null,
    files: [],
    upstream: null,
    isUnborn: false,
  };
  const state: { divergence: UpstreamState | null } = { divergence: null };
  const tracked: TrackedEntry[] = [];
  const movedAway: ByteString[] = [];
  let index = 0;
  while (index < records.length) {
    const record = records[index++] ?? '';
    switch (record[0]) {
      case '#':
        applyHeader(record, report, state);
        break;
      case '1': {
        const entry = ordinaryEntry(record);
        if (entry) tracked.push(entry);
        break;
      }
      case '2': {
        // The original path is the next record.
        if (index >= records.length) break;
        const originalPath = records[index++] ?? '';
        const renamed = renamedEntry(record, originalPath);
        if (renamed) {
          tracked.push(renamed.entry);
          if (renamed.movedFrom !== null) movedAway.push(renamed.movedFrom);
        }
        break;
      }
      case 'u': {
        const parsed = fields(record, 9);
        if (parsed) report.files.push(makeFile(parsed.path, 'conflicted'));
        break;
      }
      case '?': {
        const parsed = fields(record, 0);
        if (parsed) report.files.push(makeFile(parsed.path, 'untracked'));
        break;
      }
      default:
        // `!` (ignored) is never requested; anything newer is skipped.
        break;
    }
  }
  markDeletedFromWorkingTree(movedAway, tracked, report.files);
  report.files.push(...tracked.map(trackedFile));
  report.files.sort((lhs, rhs) => {
    const lhsConflicted = lhs.kind === 'conflicted';
    if (lhsConflicted !== (rhs.kind === 'conflicted')) return lhsConflicted ? -1 : 1;
    return lhs.path < rhs.path ? -1 : lhs.path > rhs.path ? 1 : 0;
  });
  return report;
}
