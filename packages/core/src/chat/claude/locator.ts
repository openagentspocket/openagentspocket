// Finds a Claude Code session transcript under a config directory's `projects` folder (Swift
// ClaudeTranscriptLocator): `~/.claude`, the Agent's own CLAUDE_CONFIG_DIR, then other `~/.claude*`
// directories and the Host's Claude Account directories, within one stat budget. Claude files a
// session under the key of the directory it started in; `/cd` can move it, so every project is
// tried last, closest name first.

import { TransportFailure } from '../../errors/transport-error';
import { decodeUtf8 } from '../../events/utf8';
import { type ChatHostFiles, type HostFileStatus, readBytes } from '../model/host-files';
import { frameLines } from '../model/lines';
import { isAcceptablePath, joinPath } from '../model/paths';
import {
  type ClaudeTranscriptLocation,
  longProjectKeyPrefix,
  projectKey,
  unnormalizedProjectKey,
} from './location';

export type ClaudeTranscriptUnavailable =
  /** No searched directory holds the file; `searchedAll` false: a listing was cut short or the budget ran out. */
  | { type: 'notFound'; searchedAll: boolean }
  /** No file, but Claude started the session under this home: it writes the file with the first message. */
  | { type: 'notWritten' }
  /** A file with the session's name holds a different session or a subagent's transcript. */
  | { type: 'mismatched' };

export type LocateResult =
  | { ok: true; location: ClaudeTranscriptLocation }
  | { ok: false; reason: ClaudeTranscriptUnavailable };

export interface LocateRequest {
  sessionID: string;
  /** The Agent's current and launch directories. */
  directories: string[];
  /** False keeps to the Agent's directories, a few stats, for a new session. */
  searchesEveryProject?: boolean;
  /** The Agent's own CLAUDE_CONFIG_DIR when known. */
  configDirectory?: string | null;
  /** The Host's Claude Account directories, from Usage. */
  accountDirectories?: string[];
}

export interface LocatorLimits {
  statBudget: number;
  projectListingLimit: number;
  extraConfigLimit: number;
}

export const DEFAULT_LOCATOR_LIMITS: LocatorLimits = {
  statBudget: 200,
  projectListingLimit: 1000,
  extraConfigLimit: 8,
};

export interface LocatorPlan {
  /** Directory names to stat directly, most likely first. */
  exactKeys: string[];
  /** Prefixes of over-long keys whose hash may differ. */
  longKeyPrefixes: string[];
}

export function planLocation(directories: string[]): LocatorPlan {
  const exactKeys: string[] = [];
  const longKeyPrefixes: string[] = [];
  for (const directory of directories) {
    if (!directory.startsWith('/')) continue;
    for (const key of [projectKey(directory), unnormalizedProjectKey(directory)]) {
      if (!exactKeys.includes(key)) exactKeys.push(key);
    }
    const prefix = longProjectKeyPrefix(directory);
    if (prefix !== null && !longKeyPrefixes.includes(prefix)) longKeyPrefixes.push(prefix);
  }
  return { exactKeys, longKeyPrefixes };
}

/** An absolute config directory without `..` parts, as the Host reported it. */
export function acceptableConfigDirectory(path: string): string | null {
  if (!path.startsWith('/') || !isAcceptablePath(path)) return null;
  const trimmed = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  return trimmed.split('/').includes('..') ? null : trimmed;
}

/** One path component starting `.claude`, never `.`/`..` or a separator. */
export function isConfigDirectoryName(name: string): boolean {
  return name.startsWith('.claude') && name.length <= 64 && /^[\p{L}\p{N}_.-]+$/u.test(name);
}

/** Names sharing the longest prefix with `key` first, then by name. */
export function byClosestName(names: string[], key: string): string[] {
  const shared = (name: string): number => {
    let n = 0;
    while (n < name.length && n < key.length && name.charCodeAt(n) === key.charCodeAt(n)) n += 1;
    return n;
  };
  return names
    .map((name) => ({ name, shared: shared(name) }))
    .sort((a, b) =>
      a.shared !== b.shared ? b.shared - a.shared : a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )
    .map((entry) => entry.name);
}

/** The SDK treats an empty file as "not here": Claude creates the file before writing its first record. */
export function isUsableTranscript(status: HostFileStatus): boolean {
  return (status.kind === null || status.kind === 'regular') && (status.size ?? 0) > 0;
}

/** True or false once the head decides; null when it needs more bytes. */
export function headVerdict(head: Uint8Array, sessionID: string): boolean | null {
  let sawSession = false;
  let sawChainRecord = false;
  for (const line of frameLines(head)) {
    let record: unknown;
    try {
      record = JSON.parse(decodeUtf8(line.data));
    } catch {
      continue;
    }
    if (typeof record !== 'object' || record === null) continue;
    const fields = record as Record<string, unknown>;
    if (!sawSession && typeof fields.sessionId === 'string') {
      if (fields.sessionId.toLowerCase() !== sessionID) return false;
      sawSession = true;
    }
    if (!sawChainRecord && typeof fields.uuid === 'string') {
      if (fields.isSidechain === true || typeof fields.agentId === 'string') return false;
      sawChainRecord = true;
    }
    if (sawSession && sawChainRecord) return true;
  }
  return null;
}

function isUnreadable(error: unknown): boolean {
  return error instanceof TransportFailure && error.error.kind === 'hostFileUnreadable';
}

interface Hit {
  location: ClaudeTranscriptLocation;
  modified: number;
}

export class ClaudeTranscriptLocator {
  readonly limits: LocatorLimits;

  constructor(
    private readonly files: ChatHostFiles,
    limits: Partial<LocatorLimits> = {},
  ) {
    this.limits = { ...DEFAULT_LOCATOR_LIMITS, ...limits };
  }

  async locate(request: LocateRequest): Promise<LocateResult> {
    const { sessionID } = request;
    const home = await this.files.home();
    const fileName = `${sessionID}.jsonl`;
    const plan = planLocation(request.directories);
    const tried = new Set<string>();
    let stats = 0;
    let sawMismatch = false;
    let searchedAll = true;

    const attempt = async (projects: string, key: string): Promise<Hit | null> => {
      const directory = joinPath(projects, key);
      if (tried.has(directory)) return null;
      tried.add(directory);
      const path = joinPath(directory, fileName);
      stats += 1;
      const status = await this.files.status(path);
      if (!status || !isUsableTranscript(status)) return null;
      if (!(await this.verify(path, sessionID))) {
        sawMismatch = true;
        return null;
      }
      return {
        location: { projectDirectory: directory, transcriptPath: path, sessionID },
        modified: status.modificationTime ?? 0,
      };
    };

    /** The Agent's directories in one config directory, without listing it. */
    const search = async (config: string): Promise<Hit | null> => {
      const projects = joinPath(config, 'projects');
      for (const key of plan.exactKeys) {
        const found = await attempt(projects, key);
        if (found) return found;
      }
      for (const prefix of plan.longKeyPrefixes) {
        const listing = await this.files.list({
          directory: projects,
          kinds: ['directory', 'symlink'],
          namePrefix: prefix,
          maximumEntries: 100,
        });
        for (const entry of listing?.entries ?? []) {
          if (stats >= this.limits.statBudget) return null;
          const found = await attempt(projects, entry.name);
          if (found) return found;
        }
      }
      return null;
    };

    const configs = [joinPath(home, '.claude')];
    const own = request.configDirectory ? acceptableConfigDirectory(request.configDirectory) : null;
    if (own !== null) {
      const at = configs.indexOf(own);
      if (at >= 0) configs.splice(at, 1);
      configs.unshift(own);
    }
    for (const config of configs) {
      const found = await search(config);
      if (found) return { ok: true, location: found.location };
    }
    // The cheap watch for a new session stats the known directories only.
    if (request.searchesEveryProject === false) {
      return {
        ok: false,
        reason: sawMismatch ? { type: 'mismatched' } : { type: 'notFound', searchedAll: false },
      };
    }

    /** Every project of each config directory, closest name first, until the stat budget runs out. */
    const scan = async (list: string[]): Promise<Hit | null> => {
      for (const config of list) {
        const projects = joinPath(config, 'projects');
        const listing = await this.files.list({
          directory: projects,
          kinds: ['directory', 'symlink'],
          maximumEntries: this.limits.projectListingLimit,
          maximumScanned: 20_000,
        });
        if (!listing) continue;
        if (listing.truncated || listing.scanIncomplete) searchedAll = false;
        const ordered = byClosestName(
          listing.entries.map((entry) => entry.name),
          plan.exactKeys[0] ?? '',
        );
        for (const name of ordered) {
          if (tried.has(joinPath(projects, name))) continue;
          if (stats >= this.limits.statBudget) {
            searchedAll = false;
            break;
          }
          const found = await attempt(projects, name);
          if (found) return found;
        }
      }
      return null;
    };

    // The known config directories are scanned in full before any other `~/.claude*` directory, so
    // a session moved within `~/.claude` (`/cd`) still beats an older copy elsewhere.
    const known = await scan(configs);
    if (known) return { ok: true, location: known.location };
    const accounts = this.acceptableAccountDirectories(request.accountDirectories ?? [], configs);
    const discovery = await this.otherConfigDirectories(home, [...configs, ...accounts]);
    if (!discovery.complete) searchedAll = false;
    const others = [...accounts, ...discovery.directories];
    let newest: Hit | null = null;
    for (const config of others) {
      if (stats >= this.limits.statBudget) {
        searchedAll = false;
        break;
      }
      const found = await search(config);
      if (found && (newest === null || found.modified > newest.modified)) newest = found;
    }
    if (newest) return { ok: true, location: newest.location };
    const scanned = await scan(others);
    if (scanned) return { ok: true, location: scanned.location };
    if (sawMismatch) return { ok: false, reason: { type: 'mismatched' } };
    const started = await this.sessionStarted([...configs, ...others], sessionID);
    return {
      ok: false,
      reason: started ? { type: 'notWritten' } : { type: 'notFound', searchedAll },
    };
  }

  /** The Accounts' directories that can be searched, once each, at most `extraConfigLimit`. */
  acceptableAccountDirectories(directories: string[], searched: string[]): string[] {
    const accepted: string[] = [];
    for (const directory of directories) {
      const path = acceptableConfigDirectory(directory);
      if (path === null || searched.includes(path) || accepted.includes(path)) continue;
      accepted.push(path);
      if (accepted.length === this.limits.extraConfigLimit) break;
    }
    return accepted;
  }

  /** `~/.claude*` directories beside the ones already searched, by name. */
  private async otherConfigDirectories(
    home: string,
    searched: string[],
  ): Promise<{ directories: string[]; complete: boolean }> {
    let listing: Awaited<ReturnType<ChatHostFiles['list']>>;
    try {
      listing = await this.files.list({
        directory: home,
        kinds: ['directory', 'symlink'],
        namePrefix: '.claude',
        maximumEntries: this.limits.extraConfigLimit + 1,
        maximumScanned: 5_000,
      });
    } catch (error) {
      if (isUnreadable(error)) return { directories: [], complete: false };
      throw error;
    }
    if (!listing) return { directories: [], complete: true };
    const directories: string[] = [];
    for (const entry of listing.entries) {
      if (entry.undecodedName || !isConfigDirectoryName(entry.name)) continue;
      const path = joinPath(home, entry.name);
      if (searched.includes(path)) continue;
      if (directories.length === this.limits.extraConfigLimit)
        return { directories, complete: false };
      directories.push(path);
    }
    return { directories, complete: !listing.truncated && !listing.scanIncomplete };
  }

  /** Whether Claude Code started the session under one of the config directories (`session-env/<id>`). */
  private async sessionStarted(configs: string[], sessionID: string): Promise<boolean> {
    for (const config of configs) {
      try {
        const status = await this.files.status(joinPath(config, 'session-env', sessionID));
        if (status && (status.kind === null || status.kind === 'directory')) return true;
      } catch (error) {
        // A directory the Host won't let the app see is no sign either way.
        if (!isUnreadable(error)) throw error;
      }
    }
    return false;
  }

  /** The head decides: the first record naming a session must name this one and not be a subagent's. */
  private async verify(path: string, sessionID: string): Promise<boolean> {
    let length = 4 << 10;
    for (;;) {
      const head = await readBytes(this.files, path, 0, length, 64 << 10);
      if (head === null) return false;
      const verdict = headVerdict(head, sessionID);
      if (verdict !== null) return verdict;
      if (head.length < length || length >= 64 << 10) return true;
      length = 64 << 10;
    }
  }
}
