import type { NativeSshBridge, NativeStat } from './bridge';
import { fromBase64, toBase64 } from './bytes';
import type { Sftp, SftpKind, SftpStat } from './types';

const TIMEOUT_MS = 15_000;
const KINDS = new Set<string>(['file', 'directory', 'symlink', 'other']);

function toStat(native: NativeStat): SftpStat {
  return {
    kind: native.kind && KINDS.has(native.kind) ? (native.kind as SftpKind) : null,
    size: native.size,
    modifiedAt: native.modifiedAt,
  };
}

/** A sibling of `path` for staged writes: same directory, so the rename stays atomic. */
export function stagingPath(path: string, nonce: string): string {
  const slash = path.lastIndexOf('/');
  return `${path.slice(0, slash + 1)}.${path.slice(slash + 1)}.agentico-${nonce}.tmp`;
}

const nonce = () => Math.random().toString(36).slice(2, 10);

/** SFTP over one native client id. Errors pass through `call` (SshError). */
export function bridgeSftp(
  bridge: NativeSshBridge,
  sftpId: string,
  call: <T>(run: () => Promise<T>) => Promise<T>,
): Sftp {
  const write = (path: string, data: Uint8Array, permissions: number, timeoutMs: number) =>
    call(() => bridge.sftpWrite(sftpId, path, toBase64(data), permissions, timeoutMs));
  const rename = (from: string, to: string, overwrite: boolean, timeoutMs: number) =>
    call(() => bridge.sftpRename(sftpId, from, to, overwrite, timeoutMs));
  const unlink = (path: string, timeoutMs: number) =>
    call(() => bridge.sftpUnlink(sftpId, path, timeoutMs));

  return {
    stat: async (path, options = {}) => {
      const native = await call(() =>
        bridge.sftpStat(
          sftpId,
          path,
          options.followSymlinks ?? true,
          options.timeoutMs ?? TIMEOUT_MS,
        ),
      );
      return native ? toStat(native) : null;
    },
    list: async (path, { timeoutMs = TIMEOUT_MS, ...query } = {}) => {
      const listing = await call(() => bridge.sftpList(sftpId, path, query, timeoutMs));
      if (!listing) return null;
      return {
        entries: listing.entries.map((entry) => {
          const stat = toStat(entry);
          return { name: entry.name, ...stat, isDirectory: stat.kind === 'directory' };
        }),
        truncated: listing.truncated,
        scanIncomplete: listing.scanIncomplete,
      };
    },
    read: async (path, options = {}) => {
      const data = await call(() => bridge.sftpRead(sftpId, path, options.timeoutMs ?? TIMEOUT_MS));
      return data === null ? null : fromBase64(data);
    },
    readRange: async (path, offset, maxBytes, options = {}) => {
      const slice = await call(() =>
        bridge.sftpReadRange(sftpId, path, offset, maxBytes, options.timeoutMs ?? TIMEOUT_MS),
      );
      return { data: fromBase64(slice.data), length: slice.length };
    },
    write: async (path, data, options = {}) => {
      const permissions = options.permissions ?? 0o644;
      const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
      if (!options.replace) return write(path, data, permissions, timeoutMs);
      const staged = stagingPath(path, nonce());
      await write(staged, data, permissions, timeoutMs);
      try {
        await rename(staged, path, true, timeoutMs);
      } catch (error) {
        await unlink(staged, timeoutMs).catch(() => {});
        throw error;
      }
    },
    rename: (from, to, options = {}) =>
      rename(from, to, options.overwrite ?? false, options.timeoutMs ?? TIMEOUT_MS),
    unlink: (path, options = {}) => unlink(path, options.timeoutMs ?? TIMEOUT_MS),
    mkdir: (path, options = {}) =>
      call(() =>
        bridge.sftpMkdir(
          sftpId,
          path,
          options.permissions ?? 0o755,
          options.timeoutMs ?? TIMEOUT_MS,
        ),
      ),
    rmdir: (path, options = {}) =>
      call(() => bridge.sftpRmdir(sftpId, path, options.timeoutMs ?? TIMEOUT_MS)),
    chmod: (path, permissions, options = {}) =>
      call(() => bridge.sftpChmod(sftpId, path, permissions, options.timeoutMs ?? TIMEOUT_MS)),
    close: () => call(() => bridge.sftpClose(sftpId)),
  };
}
