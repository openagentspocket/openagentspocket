// Finds a Grok Build session's transcript, `<group>/<id>/updates.jsonl` under `~/.grok/sessions`
// (Swift GrokTranscriptLocator). A custom `GROK_HOME` lives in the Agent's environment, which herdr
// does not report, so it is not searched.
//
// The group names the directory the session started in, so the Agent's directories are tried first:
// the directory percent-encoded, or for a name past 255 bytes a `<slug>-<16 hex>` group whose `.cwd`
// file names the directory. A session forked into a worktree, or started there with `/new`, files
// under the worktree's group while herdr still reports the pane's directory, so the other groups
// follow, worktrees first, within a budget. A file counts only when its head names the session: a
// fork's copied records keep their parent's `eventId`, never its `sessionId`.

import { decodeUtf8, encodeUtf8 } from '../../events/utf8';
import { type ChatHostFiles, type HostFileListing, readBytes } from '../model/host-files';
import { isAcceptablePath, joinPath } from '../model/paths';
import { groupDirectoryOfTranscript } from './locator-paths';

export type GrokLocateFailure =
  /**
   * No group holds the session's file. `searchedAll` is false when a listing was cut short, the
   * budget ran out, or the session's folder is there without its file yet: Grok writes it next.
   */
  | { type: 'notFound'; searchedAll: boolean }
  /** The session's folder holds another session's records. */
  | { type: 'mismatched' };

export type GrokLocateResult =
  | { ok: true; path: string }
  | { ok: false; reason: GrokLocateFailure };

/** The longest group name Grok writes before it falls back to a slug. */
export const MAXIMUM_GROUP_NAME_BYTES = 255;
/** The first record names the session within about 110 bytes. */
const HEAD_LENGTH = 4 << 10;
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX = '0123456789ABCDEF';

const isUnreserved = (byte: number): boolean =>
  (byte >= 0x30 && byte <= 0x39) ||
  (byte >= 0x41 && byte <= 0x5a) ||
  (byte >= 0x61 && byte <= 0x7a) ||
  byte === 0x2d ||
  byte === 0x5f ||
  byte === 0x2e ||
  byte === 0x7e;

/**
 * The group Grok files a directory's sessions under: every UTF-8 byte outside `A-Z a-z 0-9 - _ . ~`
 * as uppercase `%XX` (Grok's `encode_cwd_dirname`). Null past 255 bytes, where Grok names the group
 * `<slug>-<16 hex>` instead.
 */
export function groupName(directory: string): string | null {
  let name = '';
  let bytes = 0;
  for (const byte of encodeUtf8(directory)) {
    if (isUnreserved(byte)) {
      name += String.fromCharCode(byte);
      bytes += 1;
    } else {
      name += `%${HEX[byte >> 4]}${HEX[byte & 0x0f]}`;
      bytes += 3;
    }
    if (bytes > MAXIMUM_GROUP_NAME_BYTES) return null;
  }
  return name;
}

const isAsciiAlphanumeric = (code: number): boolean =>
  (code >= 0x30 && code <= 0x39) ||
  (code >= 0x41 && code <= 0x5a) ||
  (code >= 0x61 && code <= 0x7a);

/**
 * The slug of a long directory's group: its last component lowercased, each run of anything but
 * ASCII letters and digits one `-`, trimmed of `-`, then cut to 40, so a cut can end on `-`;
 * `workspace` when empty.
 */
export function slugForDirectory(directory: string): string {
  const leaf =
    directory
      .split('/')
      .filter((part) => part !== '')
      .pop() ?? 'workspace';
  let slug = '';
  let afterDash = false;
  for (const char of leaf.toLowerCase()) {
    if (isAsciiAlphanumeric(char.codePointAt(0) as number)) {
      slug += char;
      afterDash = false;
    } else if (!afterDash) {
      slug += '-';
      afterDash = true;
    }
  }
  const cut = [...slug.replace(/^-+|-+$/g, '')].slice(0, 40).join('');
  return cut === '' ? 'workspace' : cut;
}

/**
 * The value of the first `"sessionId"` in a file's first bytes, which every record carries near its
 * start. Null when the head holds none whole yet.
 */
export function sessionIDInHead(head: Uint8Array): string | null {
  const text = decodeUtf8(head);
  const key = '"sessionId":"';
  const start = text.indexOf(key);
  if (start < 0) return null;
  const value = text.slice(start + key.length);
  const end = value.indexOf('"');
  return end < 0 ? null : value.slice(0, end);
}

export { groupDirectoryOfTranscript };

/** `<slug>-` then 16 lowercase hex digits, the start of a BLAKE3 hash. */
function isSlugGroup(name: string, slug: string): boolean {
  return name.startsWith(`${slug}-`) && /^[0-9a-f]{16}$/.test(name.slice(slug.length + 1));
}

const isComplete = (listing: HostFileListing | null): boolean =>
  !(listing?.truncated ?? false) && !(listing?.scanIncomplete ?? false);

type Look =
  | { type: 'found'; path: string }
  /** The session's folder without a file that names a session yet. */
  | { type: 'notWritten' }
  | { type: 'mismatched' }
  | { type: 'absent' };

export class GrokTranscriptLocator {
  /** The most groups looked into per search, like Pi's `directoryBudget`. */
  groupBudget = 200;

  constructor(private readonly files: ChatHostFiles) {}

  async locate(sessionID: string, directories: readonly string[]): Promise<GrokLocateResult> {
    if (!UUID_V7.test(sessionID)) return { ok: false, reason: { type: 'mismatched' } };
    const home = await this.files.home();
    const root = joinPath(home, '.grok', 'sessions');
    const tried = new Set<string>();
    let searchedAll = true;
    let sawMismatch = false;

    /** Looks into one group; a result ends the search. */
    const attempt = async (group: string): Promise<GrokLocateResult | null> => {
      if (tried.has(group)) return null;
      tried.add(group);
      const folder = joinPath(root, group, sessionID);
      if (!isAcceptablePath(folder)) return null;
      const look = await this.look(folder, sessionID);
      switch (look.type) {
        case 'found':
          return { ok: true, path: look.path };
        case 'notWritten':
          return { ok: false, reason: { type: 'notFound', searchedAll: false } };
        case 'mismatched':
          sawMismatch = true;
          return null;
        case 'absent':
          return null;
      }
    };

    for (const directory of directories) {
      if (!isAcceptablePath(directory)) continue;
      const group = groupName(directory);
      if (group !== null) {
        const result = await attempt(group);
        if (result) return result;
        continue;
      }
      const slug = slugForDirectory(directory);
      const listing = await this.files.list({
        directory: root,
        kinds: ['directory'],
        namePrefix: `${slug}-`,
        maximumEntries: 500,
        maximumScanned: 5000,
      });
      searchedAll = searchedAll && isComplete(listing);
      for (const entry of listing?.entries ?? []) {
        if (!isSlugGroup(entry.name, slug)) continue;
        if (!(await this.cwdFile(joinPath(root, entry.name), directory))) continue;
        // Grok keeps one group per directory.
        const result = await attempt(entry.name);
        if (result) return result;
        break;
      }
    }

    // Every other group, worktrees first.
    const listing = await this.files.list({
      directory: root,
      kinds: ['directory'],
      maximumEntries: 500,
      maximumScanned: 5000,
    });
    searchedAll = searchedAll && isComplete(listing);
    const names = (listing?.entries ?? []).map((entry) => entry.name);
    const worktrees = groupName(`${joinPath(home, '.grok', 'worktrees')}/`);
    const isWorktree = (name: string) => worktrees !== null && name.startsWith(worktrees);
    for (const name of [...names.filter(isWorktree), ...names.filter((n) => !isWorktree(n))]) {
      if (tried.has(name)) continue;
      if (tried.size >= this.groupBudget) {
        searchedAll = false;
        break;
      }
      const result = await attempt(name);
      if (result) return result;
    }
    return {
      ok: false,
      reason: sawMismatch ? { type: 'mismatched' } : { type: 'notFound', searchedAll },
    };
  }

  /** What the session's folder in one group holds. Its folder is looked for first, so a group without it costs one stat. */
  private async look(folder: string, sessionID: string): Promise<Look> {
    const status = await this.files.status(folder);
    if (!status || (status.kind !== null && status.kind !== 'directory')) return { type: 'absent' };
    const path = joinPath(folder, 'updates.jsonl');
    const file = await this.files.status(path);
    if (!file || (file.kind !== null && file.kind !== 'regular') || file.size === 0) {
      return { type: 'notWritten' };
    }
    const head = await readBytes(
      this.files,
      path,
      0,
      Math.min(HEAD_LENGTH, file.size ?? HEAD_LENGTH),
      HEAD_LENGTH,
    );
    const id = head === null ? null : sessionIDInHead(head);
    if (id === null) return { type: 'notWritten' };
    return id === sessionID ? { type: 'found', path } : { type: 'mismatched' };
  }

  /** Whether a slug group's `.cwd`, which Grok writes without a newline, holds exactly `directory`. One byte more is read, so a longer file fails. */
  private async cwdFile(group: string, directory: string): Promise<boolean> {
    const expected = encodeUtf8(directory);
    const data = await readBytes(
      this.files,
      joinPath(group, '.cwd'),
      0,
      expected.length + 1,
      expected.length + 1,
    );
    return (
      data !== null &&
      data.length === expected.length &&
      data.every((byte, i) => byte === expected[i])
    );
  }
}
