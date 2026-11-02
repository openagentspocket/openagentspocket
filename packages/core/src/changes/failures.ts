import { decodeBytes } from './bytes';
import { type Frames, firstMessageLine, type Section } from './frames';
import { Cap, SectionName } from './script';
import { ChangesReadError, type ChangesReadReason } from './types';

const FRAMED_SECTIONS = [
  SectionName.version,
  SectionName.home,
  SectionName.discover,
  SectionName.status,
  SectionName.numstat,
  SectionName.head,
];

/**
 * Even a failed command is not a complete read if a later command began without reporting its
 * status. Zero-byte bodies avoid copying output; the regular parse applies each cap afterwards.
 */
export function validateChangesFraming(frames: Frames): void {
  for (const name of FRAMED_SECTIONS) frames.section(name, 0);
}

/** A stub installer or a missing binary, from the framed message and not the channel status. */
export function isGitMissing(section: Section): boolean {
  if (section.status === 127) return true;
  const line = firstMessageLine(section)?.toLowerCase() ?? '';
  return (
    (line.startsWith('xcode-select:') && line.includes('no developer tools were found')) ||
    (line.startsWith('xcrun:') && line.includes('invalid active developer path'))
  );
}

/** The failure a framed command's C-locale stderr describes. No failure ever changes Host config. */
export function classifyCommandFailure(section: Section): ChangesReadReason {
  if (isGitMissing(section)) return { kind: 'gitMissing' };
  const line = firstMessageLine(section) ?? `git exited with status ${section.status}.`;
  if (
    line.startsWith('fatal: detected dubious ownership in repository at ') ||
    (line.startsWith('fatal: unsafe repository (') && line.endsWith('is owned by someone else)'))
  ) {
    return { kind: 'notOwnedByAccount' };
  }
  if (
    line.startsWith("fatal: cannot change to '") &&
    line.endsWith("': No such file or directory")
  ) {
    return { kind: 'directoryMissing' };
  }
  if (
    line.startsWith('fatal: not a git repository') ||
    line === 'fatal: this operation must be run in a work tree'
  ) {
    return { kind: 'notAGitWorkingTree' };
  }
  return { kind: 'gitFailed', line };
}

export function failure(section: Section): ChangesReadError {
  return new ChangesReadError(classifyCommandFailure(section));
}

/**
 * The plain version probe precedes all commands carrying global options, so an old git's later
 * "unknown option" cannot hide the actionable version. Vendor suffixes are display text.
 */
export function requireUsableGit(section: Section): void {
  if (isGitMissing(section)) throw new ChangesReadError({ kind: 'gitMissing' });
  if (section.status !== 0) throw failure(section);
  if (section.isTruncated) throw new ChangesReadError({ kind: 'incomplete' });
  const line = decodeBytes(section.body).trim();
  if (!line.startsWith('git version ')) return;
  const version = line.slice('git version '.length);
  const match = /^(\d+)\.(\d+)/.exec(version);
  if (!match) return;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major < 2 || (major === 2 && minor < 17)) {
    throw new ChangesReadError({ kind: 'gitTooOld', version });
  }
}

/**
 * Counts and latest-commit reads must not silently turn failures into missing metadata. A capped
 * body can finish with zero or SIGPIPE; either way the list stays readable but carries a notice.
 */
export function validateChangesMetadata(frames: Frames): boolean {
  const sections = [
    frames.requiredSection(SectionName.numstat, Cap.numstat),
    frames.requiredSection(SectionName.head, Cap.head),
  ];
  for (const section of sections) {
    if (section.status !== 0 && !section.isTruncated) throw failure(section);
  }
  return sections.some((section) => section.isTruncated);
}
