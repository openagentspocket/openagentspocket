import { type ByteString, displayText, fromBytes } from './bytes';
import {
  classifyCommandFailure,
  failure,
  requireUsableGit,
  validateChangesFraming,
  validateChangesMetadata,
} from './failures';
import { Frames } from './frames';
import { changesTotals, countedFiles, parseNumstat } from './numstat';
import { Cap, SectionName } from './script';
import { parseStatus } from './status';
import {
  ChangesReadError,
  type CheckoutChanges,
  type CheckoutChangesRead,
  type LatestCommit,
} from './types';

export interface RawOutput {
  readonly stdout: Uint8Array | ByteString;
  readonly stderr: Uint8Array | ByteString;
}

export function asByteString(value: Uint8Array | ByteString): ByteString {
  return typeof value === 'string' ? value : fromBytes(value);
}

/** A linked Worktree's common directory is absolute and differs from its own git directory. */
export function isLinkedWorktree(gitDirectory: ByteString, commonDirectory: ByteString): boolean {
  return commonDirectory.startsWith('/') && commonDirectory !== gitDirectory;
}

/** The top level with the Host's home directory shortened to `~`. */
export function displayPath(topLevel: ByteString, home: ByteString): string {
  let trimmed = home;
  while (trimmed.length > 1 && trimmed.endsWith('/')) trimmed = trimmed.slice(0, -1);
  if (trimmed.length <= 1 || !trimmed.startsWith('/')) return displayText(topLevel);
  if (topLevel === trimmed) return '~';
  const prefix = `${trimmed}/`;
  if (!topLevel.startsWith(prefix)) return displayText(topLevel);
  return `~/${displayText(topLevel.slice(prefix.length))}`;
}

/** `<committer epoch> <subject>`; null when HEAD is unborn (no output). */
export function parseLatestCommit(body: ByteString): LatestCommit | null {
  const line = body.endsWith('\n') ? body.slice(0, -1) : body;
  const space = line.indexOf(' ');
  if (space < 0) return null;
  const seconds = line.slice(0, space);
  if (!/^\d+(\.\d+)?$/.test(seconds)) return null;
  return { subject: displayText(line.slice(space + 1)), committedAt: Number(seconds) * 1000 };
}

/**
 * Parses one Changes read. Throws `ChangesReadError`: `incomplete` when any framed status or the
 * final marker is missing, `notAGitWorkingTree` when git finds no working tree, and `gitFailed`
 * with git's first error line otherwise.
 */
export function parseChanges(
  raw: RawOutput,
  nonce: string,
  statusCap: number = Cap.status,
): CheckoutChangesRead {
  const frames = new Frames(asByteString(raw.stdout), asByteString(raw.stderr), nonce);
  if (!frames.reachedEnd) throw new ChangesReadError({ kind: 'incomplete' });
  validateChangesFraming(frames);

  requireUsableGit(frames.requiredSection(SectionName.version, Cap.version));
  const home = frames.requiredSection(SectionName.home, Cap.home);
  if (home.status !== 0) throw failure(home);
  if (home.isTruncated) throw new ChangesReadError({ kind: 'incomplete' });

  const discover = frames.requiredSection(SectionName.discover, Cap.discover);
  if (discover.status !== 0) throw new ChangesReadError(classifyCommandFailure(discover));
  if (discover.isTruncated) throw new ChangesReadError({ kind: 'incomplete' });
  // The script lists status only once git reports a top level. Git older than 2.25 answers inside
  // a git directory with an empty top level and a zero status, which lands here too.
  if (discover.body === '' || discover.body.startsWith('\n')) {
    throw new ChangesReadError({ kind: 'notAGitWorkingTree' });
  }
  const status = frames.requiredSection(SectionName.status, statusCap);
  const lines = discover.body.split('\n');
  // Four newline-terminated lines. A top level containing a newline is not supported.
  const [topLevel, prefix, gitDirectory, commonDirectory] = lines;
  if (
    lines.length !== 5 ||
    lines[4] !== '' ||
    !topLevel ||
    prefix === undefined ||
    gitDirectory === undefined ||
    commonDirectory === undefined
  ) {
    throw new ChangesReadError({ kind: 'lineBreakInPath' });
  }
  // A cut status can end on SIGPIPE; the kept records are still valid.
  if (status.status !== 0 && !status.isTruncated) throw failure(status);
  // Counts require a framed status too, even when git cannot compute them.
  const numstat = parseNumstat(frames.requiredSection(SectionName.numstat, Cap.numstat));
  const head = frames.requiredSection(SectionName.head, Cap.head);

  const report = parseStatus(status.body);
  const changes: CheckoutChanges = {
    checkout: {
      topLevel,
      isLinkedWorktree: isLinkedWorktree(gitDirectory, commonDirectory),
      displayPath: displayPath(topLevel, home.body),
    },
    head: {
      branch: report.branch,
      commit: report.commit,
      latestCommit: head.status === 0 ? parseLatestCommit(head.body) : null,
      upstream: report.upstream,
      isUnborn: report.isUnborn,
    },
    files: countedFiles(report.files, numstat),
    totals: changesTotals(report.files, numstat),
    isStatusTruncated: status.isTruncated,
    isMetadataTruncated: validateChangesMetadata(frames),
  };
  return { changes, directoryPrefix: prefix };
}
