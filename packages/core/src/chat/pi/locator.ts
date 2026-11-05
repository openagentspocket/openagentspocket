// Finds a Pi or Oh My Pi session's file (Swift PiTranscriptLocator). Pi and OMP integrations
// normally report the exact session file. Older integrations may report its UUID instead: search
// only the program's own session root, validating the header rather than choosing the newest file.

import { decodeUtf8 } from '../../events/utf8';
import type { ConversationReference } from '../model/conversation-reference';
import { type ChatHostFiles, readBytes } from '../model/host-files';
import { frameLines } from '../model/lines';
import { isAcceptablePath, joinPath } from '../model/paths';
import { asObject, asString } from '../model/reducer';

export type PiTranscriptUnavailable =
  | { type: 'notFound'; searchedAll: boolean }
  /** The reported path holds nothing yet: Pi and OMP name a session's file when it starts and write it with the first reply. */
  | { type: 'notWritten' }
  | { type: 'mismatched' }
  | { type: 'unsupportedVersion'; version: number };

export type PiLocateResult =
  | { ok: true; path: string }
  | { ok: false; reason: PiTranscriptUnavailable };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const canonicalUUID = (value: string | null): string | null =>
  value !== null && UUID.test(value) ? value.toLowerCase() : null;

const failure = (reason: PiTranscriptUnavailable): PiLocateResult => ({ ok: false, reason });

function parseLine(data: Uint8Array): Record<string, unknown> | null {
  try {
    return asObject(JSON.parse(decodeUtf8(data)));
  } catch {
    return null;
  }
}

/**
 * The session id the header names, read from a file's first bytes: the conversation's identity
 * across rewrites of the header and of the title slot before it. Null when the header is not in
 * them whole.
 */
export function piSessionIDInHead(head: Uint8Array): string | null {
  for (const line of frameLines(head).slice(0, 2)) {
    const record = parseLine(line.data);
    if (!record) return null;
    const type = asString(record.type);
    if (type === 'title') continue;
    if (type !== 'session') return null;
    return asString(record.id);
  }
  return null;
}

const encoded = (path: string) => path.replace(/[/\\:]/g, '-');

export function piProjectKey(directory: string): string {
  return `--${encoded(directory.slice(1))}--`;
}

export class PiTranscriptLocator {
  constructor(
    private readonly files: ChatHostFiles,
    private readonly directoryBudget = 200,
  ) {}

  async locate(
    reference: ConversationReference,
    directories: readonly string[],
  ): Promise<PiLocateResult> {
    if (reference.program !== 'pi' && reference.program !== 'omp')
      return failure({ type: 'mismatched' });
    if (reference.sessionID.startsWith('/')) {
      if (!isAcceptablePath(reference.sessionID) || !reference.sessionID.endsWith('.jsonl')) {
        return failure({ type: 'mismatched' });
      }
      return this.verify(reference.sessionID, null);
    }
    const id = canonicalUUID(reference.sessionID);
    if (id === null) return failure({ type: 'mismatched' });
    const home = await this.files.home();
    const root = joinPath(home, reference.program === 'pi' ? '.pi' : '.omp', 'agent', 'sessions');
    const queue = directories
      .filter(isAcceptablePath)
      .map((directory) => joinPath(root, piProjectKey(directory)));
    // OMP also uses home-relative keys in recent releases.
    if (reference.program === 'omp') {
      for (const directory of directories) {
        if (directory.startsWith(`${home}/`)) {
          queue.push(joinPath(root, `-${encoded(directory.slice(home.length + 1))}`));
        }
      }
    }
    const projects = await this.files.list({
      directory: root,
      kinds: ['directory'],
      maximumEntries: this.directoryBudget,
    });
    for (const entry of projects?.entries ?? []) queue.push(joinPath(root, entry.name));
    const visited = new Set<string>();
    let searchedAll = !(projects?.truncated ?? false) && !(projects?.scanIncomplete ?? false);
    let mismatch = false;
    for (const directory of queue) {
      if (visited.has(directory)) continue;
      visited.add(directory);
      if (visited.size > this.directoryBudget) {
        searchedAll = false;
        break;
      }
      const listing = await this.files.list({
        directory,
        kinds: ['regular'],
        nameSuffixes: [`_${id}.jsonl`, `${id}.jsonl`],
        maximumEntries: 20,
      });
      searchedAll =
        searchedAll && !(listing?.truncated ?? false) && !(listing?.scanIncomplete ?? false);
      for (const entry of listing?.entries ?? []) {
        const path = joinPath(directory, entry.name);
        if (!isAcceptablePath(path)) continue;
        const result = await this.verify(path, id);
        if (result.ok) return result;
        if (result.reason.type === 'mismatched') mismatch = true;
        if (result.reason.type === 'unsupportedVersion') return result;
      }
    }
    return failure(mismatch ? { type: 'mismatched' } : { type: 'notFound', searchedAll });
  }

  /** `sessionID` is null for a path herdr reported, which may not be written yet. */
  private async verify(path: string, sessionID: string | null): Promise<PiLocateResult> {
    const status = await this.files.status(path);
    if (
      sessionID === null &&
      (status === null || (status.kind === 'regular' && status.size === 0))
    ) {
      return failure({ type: 'notWritten' });
    }
    if (status?.kind !== 'regular' || (status.size ?? 0) <= 0) {
      return failure({ type: 'notFound', searchedAll: true });
    }
    const head = await readBytes(this.files, path, 0, 64 << 10, 64 << 10);
    if (head === null) return failure({ type: 'notFound', searchedAll: true });
    // OMP 18 writes a fixed-width title slot before the session header.
    for (const line of frameLines(head).slice(0, 2)) {
      const record = parseLine(line.data);
      if (!record) return failure({ type: 'mismatched' });
      const type = asString(record.type);
      if (type === 'title') continue;
      const id = canonicalUUID(asString(record.id));
      if (type !== 'session' || id === null || (sessionID !== null && sessionID !== id)) {
        return failure({ type: 'mismatched' });
      }
      // Tree ids and parents were introduced in v2; v1 cannot be projected safely by the tree reducer.
      const version = record.version;
      if (version !== 2 && version !== 3) {
        const known =
          typeof version === 'number' &&
          Number.isFinite(version) &&
          version >= 0 &&
          version <= 1000;
        return failure({ type: 'unsupportedVersion', version: known ? Math.trunc(version) : 1 });
      }
      return { ok: true, path };
    }
    return failure({ type: 'mismatched' });
  }
}
