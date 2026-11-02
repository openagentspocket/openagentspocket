// Chat's on-device cache (Swift FileChatTranscriptCache): one JSON document per conversation under
// `<root>/v1/<host>/`, bounded by size (least recently used first) and age, cleared per Host when the
// Host is removed. A document that cannot be read now (a locked device) is kept; one that cannot be
// decoded is deleted. Operations run one at a time, as the Swift actor did.

import { sha256 } from '@noble/hashes/sha2';
import { encodeUtf8 } from '../../events/utf8';
import type { Host } from '../../hosts/host';
import {
  type ChatAgentDirectory,
  type ChatCachedAgent,
  decodeAgentDirectory,
  directoryBelongsTo,
  directoryEntries,
  makeAgentDirectory,
  type TrustedHostKeys,
} from './agent-directory';
import {
  type ChatCacheDocument,
  type ChatCacheKey,
  type ChatCacheLoadResult,
  type ChatCachePolicy,
  type ChatTranscriptCache,
  cacheStorageName,
  DEFAULT_CACHE_POLICY,
  decodeCacheDocument,
  encodeCacheDocument,
} from './cache';
import type { CacheFileEntry, CacheFileStore } from './cache-files';

const VERSION_DIRECTORY = 'v1';
const AGENTS_FILE = 'agents.json';
const HOST_DIRECTORY =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|h-[0-9a-f]{64})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The Host's directory: its lowercased UUID, or a digest for any other id, so a name is always safe. */
export function hostDirectoryName(hostID: string): string {
  const lower = hostID.toLowerCase();
  return UUID.test(lower) ? lower : `h-${hex(sha256(encodeUtf8(lower)))}`;
}

function sameKey(a: ChatCacheKey, b: ChatCacheKey): boolean {
  return (
    a.hostID === b.hostID &&
    a.herdrSession === b.herdrSession &&
    a.program === b.program &&
    a.conversationID === b.conversationID
  );
}

export interface FileChatTranscriptCacheOptions {
  /** Directory the cache owns, such as `<caches>/AgenticoChatCache`. */
  root: string;
  policy?: ChatCachePolicy;
  now?: () => number;
  /** Names the machine a saved Agent directory belongs to. */
  trustedHostKeys?: TrustedHostKeys;
}

export class FileChatTranscriptCache implements ChatTranscriptCache {
  private readonly root: string;
  private readonly policy: ChatCachePolicy;
  private readonly now: () => number;
  private readonly trustedHostKeys: TrustedHostKeys;
  private allowedDirectories: ReadonlySet<string> | null = null;
  private knownTotalBytes: number | null = null;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly store: CacheFileStore,
    options: FileChatTranscriptCacheOptions,
  ) {
    this.root = options.root;
    this.policy = options.policy ?? DEFAULT_CACHE_POLICY;
    this.now = options.now ?? (() => Date.now());
    this.trustedHostKeys = options.trustedHostKeys ?? (() => []);
  }

  private get versionRoot(): string {
    return `${this.root}/${VERSION_DIRECTORY}`;
  }

  private hostDirectory(hostID: string): string {
    return `${this.versionRoot}/${hostDirectoryName(hostID)}`;
  }

  private filePath(key: ChatCacheKey): string {
    return `${this.hostDirectory(key.hostID)}/${cacheStorageName(key)}.json`;
  }

  private agentsPath(hostID: string): string {
    return `${this.hostDirectory(hostID)}/${AGENTS_FILE}`;
  }

  private isRefused(hostID: string): boolean {
    return (
      this.allowedDirectories !== null && !this.allowedDirectories.has(hostDirectoryName(hostID))
    );
  }

  /** Runs one operation after the ones before it, whether or not they failed. */
  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.catch(() => undefined);
    return result;
  }

  load(key: ChatCacheKey): Promise<ChatCacheLoadResult> {
    return this.serialized(async () => {
      const path = this.filePath(key);
      let text: string | null;
      try {
        text = await this.store.read(path);
      } catch {
        return { type: 'unavailable' };
      }
      if (text === null) return { type: 'miss' };
      const document = decodeCacheDocument(text);
      if (!document || !sameKey(document.key, key)) {
        await this.removePath(path);
        return { type: 'miss' };
      }
      // Reading counts as use for least-recently-used pruning.
      await this.store.touch(path).catch(() => undefined);
      return { type: 'hit', document };
    });
  }

  save(document: ChatCacheDocument): Promise<void> {
    return this.serialized(async () => {
      if (this.isRefused(document.key.hostID)) return;
      const path = this.filePath(document.key);
      const text = encodeCacheDocument(document, this.policy.maxDocumentBytes);
      if (encodeUtf8(text).length > this.policy.maxDocumentBytes) {
        await this.removePath(path);
        return;
      }
      await this.write(text, path, document.key.hostID);
    });
  }

  remove(key: ChatCacheKey): Promise<void> {
    return this.serialized(() => this.removePath(this.filePath(key)));
  }

  retainHosts(hostIDs: ReadonlySet<string>): Promise<void> {
    return this.serialized(async () => {
      const keep = new Set([...hostIDs].map(hostDirectoryName));
      this.allowedDirectories = keep;
      for (const entry of await this.store.list(this.versionRoot)) {
        if (!keep.has(entry.name)) await this.removePath(`${this.versionRoot}/${entry.name}`);
      }
      this.knownTotalBytes = null;
    });
  }

  removeAll(): Promise<void> {
    return this.serialized(async () => {
      await this.removePath(this.root);
      this.knownTotalBytes = 0;
    });
  }

  loadAgentDirectory(host: Host): Promise<ChatCachedAgent[]> {
    return this.serialized(async () => {
      const keys = await this.trustedHostKeys(host.id);
      const directory = await this.readAgentDirectory(host.id);
      if (!directory) return [];
      const entries = directoryEntries(directory, host, keys);
      if (entries.length > 0)
        await this.store.touch(this.agentsPath(host.id)).catch(() => undefined);
      return entries;
    });
  }

  saveAgentDirectory(agents: readonly ChatCachedAgent[], host: Host): Promise<void> {
    return this.serialized(async () => {
      const keys = await this.trustedHostKeys(host.id);
      if (this.isRefused(host.id)) return;
      const path = this.agentsPath(host.id);
      const directory = makeAgentDirectory(agents, host, keys);
      const text = JSON.stringify(directory);
      if (directory.agents.length === 0 || encodeUtf8(text).length > this.policy.maxDocumentBytes) {
        await this.removePath(path);
        return;
      }
      await this.write(text, path, host.id);
    });
  }

  agentDirectoryBelongs(host: Host): Promise<boolean> {
    return this.serialized(async () => {
      const keys = await this.trustedHostKeys(host.id);
      const directory = await this.readAgentDirectory(host.id);
      // Unreadable, such as while the device is locked, proves nothing.
      return directory ? directoryBelongsTo(directory, host, keys) : true;
    });
  }

  diskUsage(): Promise<number> {
    return this.serialized(async () => {
      if (this.knownTotalBytes === null) await this.pruneNow();
      return this.knownTotalBytes ?? 0;
    });
  }

  /**
   * Deletes leftovers outside the current version, documents past the age limit, then the least
   * recently used until usage is under the low-water mark, and finally empty Host directories.
   */
  prune(): Promise<void> {
    return this.serialized(() => this.pruneNow());
  }

  private async readAgentDirectory(hostID: string): Promise<ChatAgentDirectory | null> {
    const path = this.agentsPath(hostID);
    let text: string | null;
    try {
      text = await this.store.read(path);
    } catch {
      return null;
    }
    if (text === null) return null;
    const directory = decodeAgentDirectory(text);
    if (!directory) await this.removePath(path);
    return directory;
  }

  private async write(text: string, path: string, hostID: string): Promise<void> {
    // The first save after launch measures what is already stored.
    if (this.knownTotalBytes === null) await this.pruneNow();
    const directory = this.hostDirectory(hostID);
    const previous = (await this.store.list(directory)).find(
      (e) => `${directory}/${e.name}` === path,
    );
    try {
      await this.store.write(path, text);
    } catch {
      await this.removePath(path);
      return;
    }
    const total = (this.knownTotalBytes ?? 0) - (previous?.size ?? 0) + encodeUtf8(text).length;
    this.knownTotalBytes = total;
    if (total > this.policy.totalBudget) await this.pruneNow();
  }

  private async removePath(path: string): Promise<void> {
    try {
      await this.store.remove(path);
    } catch {
      // A leftover is pruned later; the next measurement recounts.
    }
    this.knownTotalBytes = null;
  }

  private async pruneNow(): Promise<void> {
    for (const entry of await this.store.list(this.root)) {
      if (entry.name !== VERSION_DIRECTORY) await this.removePath(`${this.root}/${entry.name}`);
    }
    const expiry = this.now() - this.policy.maxAgeMilliseconds;
    const documents: { path: string; size: number; modifiedMs: number }[] = [];
    for (const host of await this.store.list(this.versionRoot)) {
      const hostPath = `${this.versionRoot}/${host.name}`;
      if (!host.isDirectory || !HOST_DIRECTORY.test(host.name)) {
        await this.removePath(hostPath);
        continue;
      }
      for (const file of await this.store.list(hostPath)) {
        const path = `${hostPath}/${file.name}`;
        if (!this.isLiveDocument(file) || file.modifiedMs < expiry) {
          await this.removePath(path);
          continue;
        }
        documents.push({ path, size: file.size, modifiedMs: file.modifiedMs });
      }
    }
    let total = documents.reduce((sum, document) => sum + document.size, 0);
    if (total > this.policy.totalBudget) {
      for (const document of documents.sort((a, b) => a.modifiedMs - b.modifiedMs)) {
        if (total <= this.policy.lowWater) break;
        await this.removePath(document.path);
        total -= document.size;
      }
    }
    for (const host of await this.store.list(this.versionRoot)) {
      const hostPath = `${this.versionRoot}/${host.name}`;
      if ((await this.store.list(hostPath)).length === 0) await this.removePath(hostPath);
    }
    this.knownTotalBytes = total;
  }

  private isLiveDocument(entry: CacheFileEntry): boolean {
    return !entry.isDirectory && entry.name.endsWith('.json');
  }
}
