import {
  type ByteString,
  type ChangedFile,
  type CheckoutChanges,
  type Expansion,
  groupTitle,
  isUntrackedDirectory,
  limitNoticeText,
  listedSections,
} from '@openagentspocket/core';
import { say } from './say';

export type ChangesRow =
  | { kind: 'file'; key: string; file: ChangedFile; depth: 0 | 1; expanded: boolean | null }
  | { kind: 'note'; key: string; text: string; busy: boolean };

export interface ChangesSection {
  key: string;
  title: string;
  data: ChangesRow[];
}

/**
 * The list's sections in Source Control order. An expanded untracked directory shows its files
 * right under it; a listing that is loading, failed or limited says so in a note row.
 */
export function buildSections(
  changes: CheckoutChanges,
  expansions: ReadonlyMap<ByteString, Expansion>,
): ChangesSection[] {
  return listedSections(changes).map(({ group, files }) => ({
    key: group,
    title: groupTitle(group, say),
    data: files.flatMap((file) => rowsFor(file, expansions.get(file.path))),
  }));
}

function rowsFor(file: ChangedFile, expansion: Expansion | undefined): ChangesRow[] {
  const directory = isUntrackedDirectory(file);
  const rows: ChangesRow[] = [
    {
      kind: 'file',
      key: file.path,
      file,
      depth: 0,
      expanded: directory ? expansion !== undefined : null,
    },
  ];
  if (!directory || !expansion) return rows;
  const note = (suffix: string, text: string, busy = false): ChangesRow => ({
    kind: 'note',
    key: `${file.path}#${suffix}`,
    text,
    busy,
  });
  if (expansion.kind === 'loading') rows.push(note('loading', say('Loading…'), true));
  else if (expansion.kind === 'failed') rows.push(note('failed', expansion.message));
  else {
    const { listing } = expansion;
    for (const entry of listing.entries) {
      rows.push({
        kind: 'file',
        key: `${file.path}>${entry.path}`,
        file: entry,
        depth: 1,
        expanded: null,
      });
    }
    if (listing.isSeparateRepository) {
      rows.push(note('repository', say('This directory is a separate Git repository.')));
    }
    if (listing.limitNotice) rows.push(note('limit', limitNoticeText(listing.limitNotice, say)));
  }
  return rows;
}
