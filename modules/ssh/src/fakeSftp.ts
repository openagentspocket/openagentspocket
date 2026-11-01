import { SshError } from './errors';
import type { Sftp, SftpEntry, SftpStat } from './types';

/** SFTP status for "no such file" (SSH_FX_NO_SUCH_FILE) and the generic failure. */
const failure = (what: string) => new SshError('sftpFailure', what);

const parentOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), 0)) || '/';

/**
 * An in-memory SFTP tree with the native semantics: write creates (fails if the path exists),
 * rename refuses an existing target unless `overwrite`, rmdir only empties, missing paths read
 * as null from stat/list/read.
 */
export function fakeSftp(files: Map<string, Uint8Array>, dirs: Set<string>): Sftp {
  const exists = (path: string) => files.has(path) || dirs.has(path);
  const statOf = (path: string): SftpStat | null => {
    const data = files.get(path);
    if (data) return { kind: 'file', size: data.length, modifiedAt: 0 };
    return dirs.has(path) ? { kind: 'directory', size: 0, modifiedAt: 0 } : null;
  };
  const write = (path: string, data: Uint8Array) => {
    if (exists(path)) throw failure('exists');
    if (!dirs.has(parentOf(path))) throw failure('no such directory');
    files.set(path, data);
  };

  return {
    stat: async (path) => statOf(path),
    list: async (path, options = {}) => {
      if (!dirs.has(path)) return null;
      const prefix = path.endsWith('/') ? path : `${path}/`;
      const children = [...files.keys(), ...dirs]
        .filter((p) => p.startsWith(prefix) && p !== path && !p.slice(prefix.length).includes('/'))
        .sort();
      const entries: SftpEntry[] = children.flatMap((p) => {
        const stat = statOf(p);
        if (!stat) return [];
        const name = p.slice(prefix.length);
        if (options.kinds?.length && (!stat.kind || !options.kinds.includes(stat.kind))) return [];
        if (options.namePrefix && !name.startsWith(options.namePrefix)) return [];
        return [{ name, ...stat, isDirectory: stat.kind === 'directory' }];
      });
      const max = options.maxEntries ?? 500;
      return {
        entries: entries.slice(0, max),
        truncated: entries.length > max,
        scanIncomplete: false,
      };
    },
    read: async (path) => files.get(path) ?? null,
    readRange: async (path, offset, maxBytes) => {
      const data = files.get(path);
      if (!data) return { data: new Uint8Array(0), length: null };
      return { data: data.slice(offset, offset + maxBytes), length: data.length };
    },
    write: async (path, data, options = {}) => {
      if (!options.replace) return write(path, data);
      if (dirs.has(path)) throw failure('is a directory');
      files.set(path, data);
    },
    rename: async (from, to, options = {}) => {
      const data = files.get(from);
      if (!data) throw failure('no such file');
      if (exists(to) && !options.overwrite) throw failure('exists');
      files.delete(from);
      files.set(to, data);
    },
    unlink: async (path) => {
      if (!files.delete(path)) throw failure('no such file');
    },
    mkdir: async (path) => {
      if (exists(path)) throw failure('exists');
      dirs.add(path);
    },
    rmdir: async (path) => {
      const prefix = `${path}/`;
      if (!dirs.has(path)) throw failure('no such directory');
      if ([...files.keys(), ...dirs].some((p) => p.startsWith(prefix))) throw failure('not empty');
      dirs.delete(path);
    },
    chmod: async (path) => {
      if (!exists(path)) throw failure('no such file');
    },
    close: async () => {},
  };
}
