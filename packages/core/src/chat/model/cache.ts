// Where Chat keeps conversations between visits, so a Chat opens instantly and stays readable
// offline (Swift ChatTranscriptCache, ChatCacheDocument). The cache stores the entries Chat last
// showed WITHOUT tool output and diff lines (fetched again on expand), plus enough to tell whether
// they still describe the file on the Host. A document written by another adapter revision is
// discarded, never mixed with new entries.

import { sha256 } from '@noble/hashes/sha2';
import { encodeUtf8 } from '../../events/utf8';
import { encodeBase64 } from '../../hosts/text';
import type {
  ChatBackgroundWorkItem,
  ChatEntry,
  ChatEntryContent,
  ChatProgram,
  ChatQuestion,
  ChatTurn,
} from './types';

export const CACHE_FORMAT_VERSION = 1;

/** Identifies one conversation's cached entries. */
export interface ChatCacheKey {
  hostID: string;
  /** `""` for the default herdr session, `name:<n>` or `path:<p>` otherwise. */
  herdrSession: string;
  program: ChatProgram;
  conversationID: string;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The document's storage name: a digest, so no session name, path or id appears on disk. */
export function cacheStorageName(key: ChatCacheKey): string {
  const fields = [
    'chat-cache-key-v1',
    key.hostID.toLowerCase(),
    key.herdrSession,
    key.program,
    key.conversationID,
  ];
  return hex(sha256(encodeUtf8(fields.join('\u001f'))));
}

export interface ChatCacheDocument {
  formatVersion: number;
  key: ChatCacheKey;
  /** Bumped by an adapter whose normalization changed. */
  adapterRevision: number;
  transcriptPath: string;
  /** The transcript's first bytes when read (base64): another start means another conversation. */
  head: string;
  /** The earliest source byte the entries represent. */
  coverageStart: number;
  /** The entries are complete up to this byte. */
  coverageEnd: number;
  reachedStart: boolean;
  title: string | null;
  entries: ChatEntry[];
  savedAt: string;
  backgroundWork: ChatBackgroundWorkItem[] | null;
  latestPromptOffset: number | null;
  turns: ChatTurn[] | null;
}

export function makeCacheDocument(
  fields: Omit<
    ChatCacheDocument,
    'formatVersion' | 'head' | 'backgroundWork' | 'latestPromptOffset' | 'turns'
  > & {
    head: Uint8Array;
    backgroundWork?: ChatBackgroundWorkItem[] | null;
    latestPromptOffset?: number | null;
    turns?: ChatTurn[] | null;
  },
): ChatCacheDocument {
  return {
    ...fields,
    formatVersion: CACHE_FORMAT_VERSION,
    head: encodeBase64(fields.head),
    backgroundWork: fields.backgroundWork ?? null,
    latestPromptOffset: fields.latestPromptOffset ?? null,
    turns: fields.turns ?? null,
  };
}

export type ChatCacheLoadResult =
  | { type: 'hit'; document: ChatCacheDocument }
  | { type: 'miss' }
  /** Exists but cannot be read now (a locked device); it is kept. */
  | { type: 'unavailable' };

export interface ChatCachePolicy {
  /** Decimal bytes, as Settings formats them. */
  totalBudget: number;
  /** Pruning stops once usage falls to this. */
  lowWater: number;
  maxAgeMilliseconds: number;
  /** A larger document keeps only its newest entries that fit. */
  maxDocumentBytes: number;
}

export const DEFAULT_CACHE_POLICY: ChatCachePolicy = {
  totalBudget: 300_000_000,
  lowWater: 270_000_000,
  maxAgeMilliseconds: 30 * 86_400_000,
  maxDocumentBytes: 16_000_000,
};

export interface ChatTranscriptCache {
  load(key: ChatCacheKey): Promise<ChatCacheLoadResult>;
  save(document: ChatCacheDocument): Promise<void>;
  remove(key: ChatCacheKey): Promise<void>;
  /** Deletes every Host's documents except these, and refuses later saves for any other Host. */
  retainHosts(hostIDs: ReadonlySet<string>): Promise<void>;
  removeAll(): Promise<void>;
  diskUsage(): Promise<number>;
  prune(): Promise<void>;
}

function stripQuestion(question: ChatQuestion): ChatQuestion {
  return { ...question, queuedAnswer: null };
}

function stripContent(content: ChatEntryContent): ChatEntryContent {
  switch (content.type) {
    case 'tool': {
      const tool = content.value;
      return {
        type: 'tool',
        value: {
          ...tool,
          preview: null,
          cardAnswer: null,
          outputRead: null,
          isNotUpdating: false,
          questions: tool.questions.map(stripQuestion),
          fileChanges: tool.fileChanges
            ? {
                ...tool.fileChanges,
                files: tool.fileChanges.files.map((file) => ({
                  ...file,
                  hunks: [],
                  isLineCut: false,
                })),
              }
            : null,
        },
      };
    }
    case 'plan':
      return { type: 'plan', value: { ...content.value, cardAnswer: null } };
    case 'questions':
      return {
        type: 'questions',
        value: { questions: content.value.questions.map(stripQuestion) },
      };
    case 'notice':
      return {
        type: 'notice',
        value: { ...content.value, questions: content.value.questions.map(stripQuestion) },
      };
    default:
      return content;
  }
}

/** The entry as the cache keeps it: no tool output, diff lines or card state. */
export function stripEntryForCache(entry: ChatEntry): ChatEntry {
  return { ...entry, content: stripContent(entry.content) };
}

/** Serializes a document for storage, entries stripped, newest entries kept within `maxBytes`. */
export function encodeCacheDocument(
  document: ChatCacheDocument,
  maxBytes = DEFAULT_CACHE_POLICY.maxDocumentBytes,
): string {
  let entries = document.entries.map(stripEntryForCache);
  let text = JSON.stringify({ ...document, entries });
  while (encodeUtf8(text).length > maxBytes && entries.length > 1) {
    entries = entries.slice(Math.ceil(entries.length / 4));
    text = JSON.stringify({
      ...document,
      entries,
      reachedStart: false,
      coverageStart: entries[0]?.sourceOffset ?? document.coverageStart,
    });
  }
  return text;
}

/** Null when the text is not a document of this format. */
export function decodeCacheDocument(text: string): ChatCacheDocument | null {
  try {
    const value = JSON.parse(text) as Partial<ChatCacheDocument> | null;
    if (
      !value ||
      value.formatVersion !== CACHE_FORMAT_VERSION ||
      !value.key ||
      !Array.isArray(value.entries)
    )
      return null;
    return {
      backgroundWork: null,
      latestPromptOffset: null,
      turns: null,
      ...value,
    } as ChatCacheDocument;
  } catch {
    return null;
  }
}

/**
 * The document if it was written by `adapterRevision`; otherwise it is removed and the load is a
 * miss, so entries of two normalizations never mix.
 */
export async function loadCurrent(
  cache: ChatTranscriptCache,
  key: ChatCacheKey,
  adapterRevision: number,
): Promise<ChatCacheLoadResult> {
  const result = await cache.load(key);
  if (result.type !== 'hit' || result.document.adapterRevision === adapterRevision) return result;
  await cache.remove(key);
  return { type: 'miss' };
}

/** A cache that lives only as long as the process: the default for demo mode and tests. */
export class VolatileChatTranscriptCache implements ChatTranscriptCache {
  private documents = new Map<string, ChatCacheDocument>();
  private allowedHosts: ReadonlySet<string> | null = null;

  async load(key: ChatCacheKey): Promise<ChatCacheLoadResult> {
    const document = this.documents.get(cacheStorageName(key));
    return document ? { type: 'hit', document } : { type: 'miss' };
  }

  async save(document: ChatCacheDocument): Promise<void> {
    if (this.allowedHosts && !this.allowedHosts.has(document.key.hostID)) return;
    this.documents.set(cacheStorageName(document.key), document);
  }

  async remove(key: ChatCacheKey): Promise<void> {
    this.documents.delete(cacheStorageName(key));
  }

  async retainHosts(hostIDs: ReadonlySet<string>): Promise<void> {
    this.allowedHosts = hostIDs;
    for (const [name, document] of this.documents)
      if (!hostIDs.has(document.key.hostID)) this.documents.delete(name);
  }

  async removeAll(): Promise<void> {
    this.documents.clear();
  }

  async diskUsage(): Promise<number> {
    return 0;
  }

  async prune(): Promise<void> {}
}
