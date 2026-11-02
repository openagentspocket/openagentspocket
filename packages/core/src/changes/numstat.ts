import type { ByteString } from './bytes';
import type { Section } from './frames';
import type { ChangedFile, ChangesTotals, LineCounts, UpstreamState } from './types';

/** `# branch.ab +A -B`; anything else is an unknown comparison, never a deleted upstream. */
export function parseDivergence(value: string): UpstreamState {
  const fields = value.split(' ');
  const [plus, minus] = fields;
  if (fields.length !== 2 || !plus?.startsWith('+') || !minus?.startsWith('-')) {
    return { kind: 'unknown' };
  }
  const ahead = decimalCount(plus.slice(1));
  const behind = decimalCount(minus.slice(1));
  return ahead === null || behind === null
    ? { kind: 'unknown' }
    : { kind: 'tracking', ahead, behind };
}

function decimalCount(text: string): number | null {
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}

/** Numeric counts are read from the same exec as status; rename paths are NUL-delimited. */
export interface NumstatReport {
  /** Keyed by `path` or `original\0path`, raw bytes. */
  records: Map<string, LineCounts>;
  linesAreComplete: boolean;
  linesAreAvailable: boolean;
}

const key = (path: ByteString, originalPath: ByteString | null = null) =>
  originalPath === null ? path : `${originalPath}\0${path}`;

const ZERO: LineCounts = { kind: 'lines', added: 0, removed: 0 };

function sameCounts(lhs: LineCounts, rhs: LineCounts): boolean {
  if (lhs.kind === 'binary' || rhs.kind === 'binary') return lhs.kind === rhs.kind;
  return lhs.added === rhs.added && lhs.removed === rhs.removed;
}

export function parseNumstat(section: Section): NumstatReport {
  const linesAreAvailable = section.status === 0 || section.isTruncated;
  const report: NumstatReport = {
    records: new Map(),
    linesAreAvailable,
    linesAreComplete: linesAreAvailable && !section.isTruncated,
  };
  if (!linesAreAvailable) return report;
  if (section.body !== '' && !section.body.endsWith('\0')) report.linesAreComplete = false;
  const records = section.body.split('\0');
  // The last element is empty after a terminating NUL, or an incomplete record at the cap. A
  // rename is kept only with both complete paths.
  records.pop();
  let index = 0;
  while (index < records.length) {
    const fields = splitFields(records[index] ?? '');
    index += 1;
    if (fields === null) {
      report.linesAreComplete = false;
      continue;
    }
    let path = fields.path;
    let original: ByteString | null = null;
    if (fields.path === '') {
      if (index + 1 >= records.length) {
        report.linesAreComplete = false;
        break;
      }
      original = records[index] ?? '';
      path = records[index + 1] ?? '';
      index += 2;
    }
    if (path === '' || original === '') {
      report.linesAreComplete = false;
      continue;
    }
    let value: LineCounts;
    const added = decimalCount(fields.added);
    const removed = decimalCount(fields.removed);
    if (fields.added === '-' && fields.removed === '-') value = { kind: 'binary' };
    else if (added !== null && removed !== null) value = { kind: 'lines', added, removed };
    else {
      report.linesAreComplete = false;
      continue;
    }
    // Some unmerged forms emit a zero placeholder beside the real record. Keep the nonzero
    // counts once, in either order.
    const id = key(path, original);
    const previous = report.records.get(id);
    if (previous) {
      if (sameCounts(value, ZERO) || sameCounts(value, previous)) continue;
      if (!sameCounts(previous, ZERO)) {
        report.linesAreComplete = false;
        continue;
      }
    }
    report.records.set(id, value);
  }
  return report;
}

function splitFields(record: string): { added: string; removed: string; path: string } | null {
  const first = record.indexOf('\t');
  const second = first < 0 ? -1 : record.indexOf('\t', first + 1);
  if (second < 0) return null;
  return {
    added: record.slice(0, first),
    removed: record.slice(first + 1, second),
    path: record.slice(second + 1),
  };
}

function combinedCounts(lhs: LineCounts, rhs: LineCounts): LineCounts | null {
  if (lhs.kind === 'lines' && rhs.kind === 'lines') {
    const added = lhs.added + rhs.added;
    const removed = lhs.removed + rhs.removed;
    if (!Number.isSafeInteger(added) || !Number.isSafeInteger(removed)) return null;
    return { kind: 'lines', added, removed };
  }
  return { kind: 'binary' };
}

/** Files with their counts. Status pairs staged renames against the index, so a rewrite can make
 *  the diff against HEAD split that rename into an addition and a deletion: both are required. */
export function countedFiles(files: readonly ChangedFile[], numstat: NumstatReport): ChangedFile[] {
  const { records } = numstat;
  return files.map((file) => {
    if (file.kind === 'untracked') return file;
    let lineCounts = records.get(key(file.path, file.originalPath)) ?? null;
    if (lineCounts === null && file.originalPath !== null) {
      const added = records.get(key(file.path));
      const removed = records.get(key(file.originalPath));
      if (added && removed) lineCounts = combinedCounts(added, removed);
    }
    return { ...file, lineCounts };
  });
}

export function changesTotals(
  files: readonly ChangedFile[],
  numstat: NumstatReport,
): ChangesTotals {
  const untrackedItems = files.filter((file) => file.kind === 'untracked').length;
  let added = 0;
  let removed = 0;
  let linesAreComplete = numstat.linesAreComplete;
  for (const counts of numstat.records.values()) {
    if (counts.kind !== 'lines') continue;
    const nextAdded = added + counts.added;
    const nextRemoved = removed + counts.removed;
    const overflow = !Number.isSafeInteger(nextAdded) || !Number.isSafeInteger(nextRemoved);
    added = Number.isSafeInteger(nextAdded) ? nextAdded : Number.MAX_SAFE_INTEGER;
    removed = Number.isSafeInteger(nextRemoved) ? nextRemoved : Number.MAX_SAFE_INTEGER;
    if (overflow) linesAreComplete = false;
  }
  return {
    trackedFiles: files.length - untrackedItems,
    untrackedItems,
    added,
    removed,
    linesAreComplete,
    linesAreAvailable: numstat.linesAreAvailable,
  };
}
