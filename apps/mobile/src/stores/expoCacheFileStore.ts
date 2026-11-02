import {
  type CacheFileEntry,
  type CacheFileStore,
  FileChatTranscriptCache,
  type KnownHostsStore,
  trustedHostKeysFrom,
} from '@openagentspocket/core';
import { Directory, File, Paths } from 'expo-file-system';

/** Older SDKs report seconds, newer ones milliseconds; no real file is dated before 1973 in ms. */
function toMilliseconds(time: number | null | undefined): number {
  if (time === null || time === undefined) return 0;
  return time < 100_000_000_000 ? time * 1000 : time;
}

function parentOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}

/**
 * The cache port over Expo's file system. Writes go to a sibling `.tmp` file that then replaces the
 * target, so a killed app never leaves a torn document (the cache prunes stray `.tmp` files).
 */
export function createExpoCacheFileStore(): CacheFileStore {
  const store: CacheFileStore = {
    async read(path) {
      const file = new File(path);
      return file.exists ? file.text() : null;
    },

    async write(path, text) {
      new Directory(parentOf(path)).create({ intermediates: true, idempotent: true });
      const temporary = new File(`${path}.tmp`);
      temporary.create({ overwrite: true });
      await temporary.write(text);
      temporary.move(new File(path), { overwrite: true });
    },

    async remove(path) {
      const file = new File(path);
      if (file.exists) {
        file.delete();
        return;
      }
      const directory = new Directory(path);
      if (directory.exists) directory.delete();
    },

    async list(path) {
      const directory = new Directory(path);
      if (!directory.exists) return [];
      return directory.list().map((item): CacheFileEntry => {
        if (item instanceof Directory) {
          return { name: item.name, isDirectory: true, size: 0, modifiedMs: 0 };
        }
        return {
          name: item.name,
          isDirectory: false,
          size: item.size ?? 0,
          modifiedMs: toMilliseconds(item.modificationTime),
        };
      });
    },

    // The file system has no way to set a modification date, so use is recorded by rewriting.
    async touch(path) {
      const text = await store.read(path);
      if (text !== null) await store.write(path, text);
    },
  };
  return store;
}

/** The Chat cache under the platform cache directory: the system may reclaim it, it is not backed up. */
export function createChatTranscriptCache(knownHosts: KnownHostsStore): FileChatTranscriptCache {
  const root = `${Paths.cache.uri.replace(/\/$/, '')}/AgenticoChatCache`;
  return new FileChatTranscriptCache(createExpoCacheFileStore(), {
    root,
    trustedHostKeys: trustedHostKeysFrom(knownHosts),
  });
}
