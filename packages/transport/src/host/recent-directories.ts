import {
  isAbsoluteHostPath,
  type KeyValueStorage,
  quotedAbsolutePath,
} from '@openagentspocket/core';
import { withDeadline } from '../deadline';
import type { SshTransport } from '../transport';
import { hostPlatform } from './environment';
import { cLocale } from './shell';

export const RECENT_DIRECTORY_LIMIT = 10;
// Caps on what the script reads, so a Host with years of sessions stays one cheap round trip.
const MAXIMUM_CLAUDE_PROJECTS = 30;
const MAXIMUM_CODEX_SESSIONS = 30;
const MAXIMUM_DISCOVERED = 20;
const MAXIMUM_CANDIDATES = 40;

export const CANDIDATE_MARKER = '__AGENTICO_RECENT_CANDIDATE__=';
export const DISCOVERED_MARKER = '__AGENTICO_RECENT_DIR__=';
export const RECENT_HOME_MARKER = '__AGENTICO_RECENT_HOME__=';

/** What the Host-side probe reported. */
export interface RecentDirectoryProbeResult {
  /** Which of the app-known candidates are existing directories. */
  existingCandidates: Set<string>;
  /** Directories its recent agent sessions ran in, newest first. */
  discovered: string[];
  /** The account's home, for shortening paths. */
  home: string | null;
}

export interface RecentDirectory {
  readonly path: string;
  /** The path with the Host's home shortened to `~`. */
  readonly displayPath: string;
  /** The folder's own name, as the row's title. */
  readonly name: string;
}

const SCRIPT = String.raw`printf '${RECENT_HOME_MARKER}%s\n' "$HOME"
for c in "$@"; do [ -d "$c" ] && printf '${CANDIDATE_MARKER}%s\n' "$c"; done
cd "$HOME" 2>/dev/null || exit 0
list=$({
  for d in $(ls -td .claude/projects/*/ 2>/dev/null | head -n ${MAXIMUM_CLAUDE_PROJECTS}); do
    f=$(ls -t "$d"*.jsonl 2>/dev/null | head -n 1)
    [ -n "$f" ] && printf '%s\n' "$f"
  done
  ls -t .codex/sessions/*/*/*/rollout-*.jsonl 2>/dev/null | head -n ${MAXIMUM_CODEX_SESSIONS}
} | grep -v '^$' | grep -v '[[:space:]"\\]')
[ -n "$list" ] || exit 0
seen=""
n=0
for f in $(ls -t $list 2>/dev/null); do
  case "$f" in
    .codex/*) p=$(head -n 1 "$f" | head -c 16384 | sed -n 's/.*"cwd":"\([^"\\]*\)".*/\1/p' | head -n 1) ;;
    *) p=$(tail -c 65536 "$f" | sed -n 's/.*"cwd":"\([^"\\]*\)".*/\1/p' | tail -n 1) ;;
  esac
  case "$p" in /*) ;; *) continue ;; esac
  case "$seen" in *"|$p|"*) continue ;; esac
  [ -d "$p" ] || continue
  seen="$seen|$p|"
  printf '${DISCOVERED_MARKER}%s\n' "$p"
  n=$((n + 1))
  [ "$n" -ge ${MAXIMUM_DISCOVERED} ] && break
done
exit 0`;

/**
 * One `/bin/sh` command. Candidates (the app's history and the live workspaces) are positional
 * arguments, never interpolated into the script body. Claude Code's `cwd` is read from the
 * newest `.jsonl` tail of each recent project folder; Codex's from the first line of the newest
 * rollouts. Only an existing directory's path is printed. Always exits 0.
 */
export function recentDirectoriesCommand(candidates: readonly string[]): string {
  const quoted = candidates
    .slice(0, MAXIMUM_CANDIDATES)
    .flatMap((candidate) => quotedAbsolutePath(candidate) ?? []);
  const escaped = SCRIPT.replaceAll("'", "'\\''");
  return [`/bin/sh -c '${escaped}' herdr-recent-dirs`, ...quoted].join(' ');
}

/** Parses the marker-framed output; noise, malformed lines, unquotable paths and duplicates drop. */
export function parseRecentDirectories(output: string): RecentDirectoryProbeResult {
  const result: RecentDirectoryProbeResult = {
    existingCandidates: new Set(),
    discovered: [],
    home: null,
  };
  const seen = new Set<string>();
  for (const line of output.split(/\r?\n|\r/)) {
    if (line.startsWith(CANDIDATE_MARKER)) {
      const path = line.slice(CANDIDATE_MARKER.length);
      if (quotedAbsolutePath(path)) result.existingCandidates.add(path);
    } else if (line.startsWith(DISCOVERED_MARKER)) {
      const path = line.slice(DISCOVERED_MARKER.length);
      if (!quotedAbsolutePath(path) || seen.has(path)) continue;
      seen.add(path);
      result.discovered.push(path);
    } else if (line.startsWith(RECENT_HOME_MARKER)) {
      const home = line.slice(RECENT_HOME_MARKER.length);
      if (quotedAbsolutePath(home)) result.home = home;
    }
  }
  return result;
}

/** Drops trailing separators so `/a/b/` and `/a/b` dedupe. */
export function normalizeDirectory(path: string): string {
  let value = path;
  while (value.length > 1 && value.endsWith('/')) value = value.slice(0, -1);
  return value;
}

/**
 * Merges the sources into at most `limit` directories: the app's history (newest first), the
 * live workspaces, then the Host's recent sessions. The first occurrence wins. With a probe
 * answer (`verified`), app-known entries must exist on the Host; without one they are kept.
 */
export function mergeRecentDirectories(sources: {
  history: readonly string[];
  live: readonly string[];
  discovered: readonly string[];
  verified: ReadonlySet<string> | null;
  limit?: number;
}): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  const add = (path: string, requiresVerification: boolean) => {
    const normalized = normalizeDirectory(path);
    if (!isAbsoluteHostPath(normalized) || normalized === '/') return;
    if (requiresVerification && sources.verified && !sources.verified.has(path)) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    merged.push(normalized);
  };
  for (const path of sources.history) add(path, true);
  for (const path of sources.live) add(path, true);
  for (const path of sources.discovered) add(path, false);
  return merged.slice(0, Math.max(0, sources.limit ?? RECENT_DIRECTORY_LIMIT));
}

/** `path` with `home` shortened to `~`; other paths stay as given. */
export function shortenedDirectory(path: string, home: string | null): string {
  const base = home === null ? null : normalizeDirectory(home);
  if (!base || base === '/') return path;
  if (path === base) return '~';
  return path.startsWith(`${base}/`) ? `~${path.slice(base.length)}` : path;
}

function lastComponent(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part !== '');
  return parts[parts.length - 1] ?? path;
}

export function recentDirectoryEntries(
  paths: readonly string[],
  home: string | null,
): RecentDirectory[] {
  return paths.map((path) => ({
    path,
    displayPath: shortenedDirectory(path, home),
    name: lastComponent(path),
  }));
}

/**
 * Asks the Host which candidates exist and where its recent agent sessions ran. Null is "no
 * answer" (native Windows, no /bin/sh, a nonzero exit); the form then keeps what the app knows.
 */
export async function probeRecentDirectories(
  transport: SshTransport,
  candidates: readonly string[],
): Promise<RecentDirectoryProbeResult | null> {
  if (hostPlatform(transport) === 'nativeWindows') return null;
  const command = cLocale(recentDirectoriesCommand(candidates));
  const result = await withDeadline(transport.settings.clock, transport.requestBudgetMs, () =>
    transport.runExec(command),
  );
  return result.exitCode === 0 ? parseRecentDirectories(result.stdout) : null;
}

const HISTORY_KEY = 'recent-agent-directories-by-host';
const HISTORY_CAPACITY = 10;

/** The directories the user started Agents in, per Host, newest first (capped per Host). */
export class RecentDirectoryHistory {
  constructor(private readonly storage: KeyValueStorage) {}

  directories(hostId: string): string[] {
    return this.all()[hostId] ?? [];
  }

  remember(path: string, hostId: string): void {
    const normalized = normalizeDirectory(path);
    if (!isAbsoluteHostPath(normalized) || normalized === '/') return;
    const all = this.all();
    const list = (all[hostId] ?? []).filter((entry) => entry !== normalized);
    all[hostId] = [normalized, ...list].slice(0, HISTORY_CAPACITY);
    this.storage.set(HISTORY_KEY, JSON.stringify(all));
  }

  forget(hostId: string): void {
    const all = this.all();
    if (!(hostId in all)) return;
    delete all[hostId];
    this.storage.set(HISTORY_KEY, JSON.stringify(all));
  }

  private all(): Record<string, string[]> {
    const raw = this.storage.getString(HISTORY_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as Record<string, string[]>;
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }
}
