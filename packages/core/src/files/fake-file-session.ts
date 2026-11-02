import type { FileSftp, FileSshSession } from './sftp-host';

export interface FakeFileSessionOptions {
  /** Canned results by exact command; anything else exits 127. */
  exec?: Record<string, { exitCode: number; stdout: string; stderr: string }>;
  files?: Record<string, Uint8Array>;
  /** Directories that exist (the parents of `files` are added). */
  directories?: string[];
}

/** An error carrying the SSH module's `sftpFailure` code, which the file browser classifies. */
class FakeSftpFailure extends Error {
  readonly code = 'sftpFailure';
}

const failure = (what: string) => new FakeSftpFailure(what);
const parentOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), 0)) || '/';

/**
 * An in-memory file session with the SFTP semantics the browser relies on: write creates (fails if
 * the path exists), rename refuses an existing target unless `overwrite`, rmdir only empties,
 * missing paths read as null. Core keeps its own so it never imports the native SSH module.
 */
export class FakeFileSession implements FileSshSession {
  readonly files: Map<string, Uint8Array>;
  readonly directories: Set<string>;

  constructor(private readonly options: FakeFileSessionOptions = {}) {
    this.files = new Map(Object.entries(options.files ?? {}));
    this.directories = new Set(['/', ...(options.directories ?? [])]);
    for (const path of this.files.keys()) this.directories.add(parentOf(path));
  }

  async exec(command: string) {
    return this.options.exec?.[command] ?? { exitCode: 127, stdout: '', stderr: 'not found' };
  }

  async sftp(): Promise<FileSftp> {
    const { files, directories: dirs } = this;
    const exists = (path: string) => files.has(path) || dirs.has(path);
    const statOf = (path: string) => {
      const data = files.get(path);
      if (data) return { kind: 'file' as const, size: data.length, modifiedAt: 0 };
      return dirs.has(path) ? { kind: 'directory' as const, size: 0, modifiedAt: 0 } : null;
    };
    return {
      stat: async (path) => statOf(path),
      list: async (path, options = {}) => {
        if (!dirs.has(path)) return null;
        const prefix = path.endsWith('/') ? path : `${path}/`;
        const children = [...files.keys(), ...dirs]
          .filter(
            (p) => p.startsWith(prefix) && p !== path && !p.slice(prefix.length).includes('/'),
          )
          .sort();
        const entries = children.flatMap((p) => {
          const stat = statOf(p);
          return stat ? [{ name: p.slice(prefix.length), ...stat }] : [];
        });
        const max = options.maxEntries ?? 500;
        return {
          entries: entries.slice(0, max),
          truncated: entries.length > max,
          scanIncomplete: false,
        };
      },
      readRange: async (path, offset, maxBytes) => {
        const data = files.get(path);
        if (!data) return { data: new Uint8Array(0), length: null };
        return { data: data.slice(offset, offset + maxBytes), length: data.length };
      },
      write: async (path, data) => {
        if (exists(path)) throw failure('exists');
        if (!dirs.has(parentOf(path))) throw failure('no such directory');
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
      rmdir: async (path) => {
        const prefix = `${path}/`;
        if (!dirs.has(path)) throw failure('no such directory');
        if ([...files.keys(), ...dirs].some((p) => p.startsWith(prefix)))
          throw failure('not empty');
        dirs.delete(path);
      },
      chmod: async (path) => {
        if (!exists(path)) throw failure('no such file');
      },
      close: async () => {},
    };
  }
}
