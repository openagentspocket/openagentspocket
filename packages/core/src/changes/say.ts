/**
 * Every catalog key the Changes feature speaks. Core stays free of any i18n runtime: display
 * strings are built through a `Say`, which the app backs with the catalog and tests with the
 * source text. A test in the app pins that each key exists in both catalogs.
 */
export const CHANGES_KEYS = [
  'Conflicts',
  'Staged',
  'Changes',
  'Untracked',
  'Modified',
  'Added',
  'Deleted',
  'Renamed',
  'Conflicted',
  'Unstaged',
  'Staged and unstaged',
  'Binary',
  '+%@ −%@ lines',
  'Detached at %@',
  'unknown commit',
  'just now',
  '%@ from %@',
  'From %@',
  '%@ file changed',
  '%@ files changed',
  'more than %@ file changed',
  'more than %@ files changed',
  '%@ untracked item',
  '%@ untracked items',
  'more than %@ untracked item',
  'more than %@ untracked items',
  'untracked items not counted',
  "The Host's reply was truncated before any files could be listed.",
  'Showing %@ of more than %@ changed files.',
  'Showing %@ of %@ changed files.',
  'Showing %@ of more than %@ files.',
  'Showing %@ of %@ files.',
  "This connection can't read Changes.",
  "This directory isn't inside a git working tree.",
  "The Host's reply ended early, so these Changes may be incomplete.",
  "Git couldn't be run on this Host. Install git and make it available to the SSH account.",
  'This Host has git %@. Changes requires git 2.17 or later.',
  "Git's ownership protection refused this Checkout because it belongs to another user account on the Host. Agentico doesn't bypass that protection.",
  'This directory no longer exists on the Host.',
  "The Checkout's path contains a line break, which Changes can't read.",
  'This directory is a separate Git repository.',
  'This file is too large to display in full.',
  'Possibly incomplete · %@',
  'Read at %@',
  'Read %@ at %@',
  '%@: %@ ahead, %@ behind',
  'Upstream %@ was deleted',
  'Upstream %@, comparison unavailable',
  'Not a Git Working Tree',
  "Couldn't Read Changes",
  'Git Not Found',
  'Git Version Too Old',
  'Checkout Ownership Protected',
  'Directory No Longer Exists',
  'Incomplete Changes',
  'Reading Changes Timed Out',
  'The Host took too long to read Changes. Pull to try again.',
  'This Agent has no working directory.',
] as const;

export type ChangesKey = (typeof CHANGES_KEYS)[number];

export type SayArg = string | number;

/** Looks up a catalog key and fills its placeholders in order. */
export type Say = (key: ChangesKey, ...args: readonly SayArg[]) => string;

/** The catalog's source language: the key with its `%@` placeholders filled in order. */
export const sourceSay: Say = (key, ...args) => {
  let next = 0;
  return key.replace(/%@/g, () => String(args[next++] ?? ''));
};
