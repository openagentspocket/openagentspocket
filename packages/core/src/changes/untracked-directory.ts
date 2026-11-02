import type { ByteString } from './bytes';
import { failure } from './failures';
import { Frames } from './frames';
import { asByteString, type RawOutput } from './parse-changes';
import { DISPLAY_LIMIT, limitNotice } from './presentation';
import { Cap, SectionName } from './script';
import { makeFile } from './status';
import { ChangesReadError, type UntrackedDirectoryListing } from './types';

/** `? <path>`. Tracked rows, headers and ignored records are not entries. */
function untrackedPath(record: ByteString): ByteString | null {
  if (record.length < 3 || !record.startsWith('? ')) return null;
  return record.slice(2);
}

/**
 * Parses one untracked-directory listing. Throws `ChangesReadError`: `incomplete` when the framed
 * status or the final marker is missing; a failed status is classified like a Changes read. A
 * status cut short is kept.
 */
export function parseUntrackedDirectory(
  raw: RawOutput,
  nonce: string,
  directory: ByteString,
  displayLimit: number = DISPLAY_LIMIT,
  cap: number = Cap.status,
): UntrackedDirectoryListing {
  const frames = new Frames(asByteString(raw.stdout), asByteString(raw.stderr), nonce);
  if (!frames.reachedEnd) throw new ChangesReadError({ kind: 'incomplete' });
  const section = frames.requiredSection(SectionName.untracked, cap);
  // A cut status can end on SIGPIPE; the kept records are still valid.
  if (section.status !== 0 && !section.isTruncated) throw failure(section);

  const records = section.body.split('\0');
  records.pop();
  let isSeparateRepository = false;
  const paths: ByteString[] = [];
  let index = 0;
  while (index < records.length) {
    const record = records[index++] ?? '';
    // A rename or copy is two NUL fields; the original path is not a record, or
    // `? dir/original` would become an untracked file.
    if (record.startsWith('2')) {
      if (index < records.length) index += 1;
      continue;
    }
    const path = untrackedPath(record);
    if (path === null) continue;
    // Git prints the directory itself when it is a nested repository.
    if (path === directory) {
      isSeparateRepository = true;
      continue;
    }
    paths.push(path);
  }
  paths.sort((lhs, rhs) => (lhs < rhs ? -1 : lhs > rhs ? 1 : 0));
  const shown = displayLimit > 0 ? paths.slice(0, displayLimit) : [];
  return {
    directory,
    entries: shown.map((path) => makeFile(path, 'untracked')),
    total: paths.length,
    isTruncated: section.isTruncated,
    isSeparateRepository,
    limitNotice: limitNotice(shown.length, paths.length, section.isTruncated, 'files'),
  };
}
