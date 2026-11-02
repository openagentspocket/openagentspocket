import { TransportFailure } from '../errors';
import { agenticoEntry, parsePluginList } from '../hosts/plugin-installation';
import { NotificationRegistrationError } from './errors';

export const REGISTRATION_FILE_NAME = 'notifications.json';
export const CONFIG_FILE_NAME = 'notify.json';

/** The files Notification Registration reads and replaces on one Host. */
export interface NotificationTransport {
  /** null when the file does not exist. */
  readRegistration(): Promise<Uint8Array | null>;
  /** Atomic whole-file replace. */
  replaceRegistration(data: Uint8Array): Promise<void>;
  readConfig(): Promise<Uint8Array | null>;
  replaceConfig(data: Uint8Array): Promise<void>;
}

/** The slice of the SSH module's SFTP client the transport needs. */
export interface RegistrationSftp {
  read(path: string): Promise<Uint8Array | null>;
  write(
    path: string,
    data: Uint8Array,
    options: { replace: true; permissions: number },
  ): Promise<void>;
}

/** Owner-only: the file holds Notification Keys. */
const FILE_PERMISSIONS = 0o600;

function wrap<T>(kind: 'readFailed' | 'writeFailed', operation: () => Promise<T>): Promise<T> {
  return operation().catch((thrown: unknown) => {
    if (thrown instanceof TransportFailure || thrown instanceof NotificationRegistrationError) {
      throw thrown;
    }
    throw new NotificationRegistrationError({
      kind,
      detail: thrown instanceof Error ? thrown.message : String(thrown),
    });
  });
}

/**
 * The SFTP-backed transport: reads the plugin's config dir files and replaces them atomically
 * (the SFTP client stages a sibling file and renames it over the target).
 */
export function sftpNotificationTransport(
  sftp: RegistrationSftp,
  configDir: string,
): NotificationTransport {
  const dir = configDir.endsWith('/') ? configDir.slice(0, -1) : configDir;
  const read = (name: string) => wrap('readFailed', () => sftp.read(`${dir}/${name}`));
  const replace = (name: string, data: Uint8Array) =>
    wrap('writeFailed', () =>
      sftp.write(`${dir}/${name}`, data, { replace: true, permissions: FILE_PERMISSIONS }),
    );
  return {
    readRegistration: () => read(REGISTRATION_FILE_NAME),
    replaceRegistration: (data) => replace(REGISTRATION_FILE_NAME, data),
    readConfig: () => read(CONFIG_FILE_NAME),
    replaceConfig: (data) => replace(CONFIG_FILE_NAME, data),
  };
}

/** Runs one command line on the Host; the app adapter wraps it in a login shell. */
export type HostCommandRunner = (
  command: string,
) => Promise<{ readonly exitStatus: number; readonly stdout: string }>;

function pluginListResult(stdout: string): unknown {
  const parsed: unknown = JSON.parse(stdout);
  if (typeof parsed === 'object' && parsed !== null && 'result' in parsed) {
    return (parsed as { result: unknown }).result;
  }
  return parsed;
}

/**
 * The config dir of the Agentico plugin as the Host's herdr reports it. Gated on the plugin
 * being installed and enabled first: `herdr plugin config-dir` happily prints (and creates) a
 * directory for any id, so it cannot carry the "is it installed" check. `listCommand` and
 * `configDirCommand(id)` are herdr command lines aimed at the Host's session or endpoint.
 */
export async function resolvePluginConfigDir(
  run: HostCommandRunner,
  listCommand: string,
  configDirCommand: (pluginId: string) => string,
): Promise<string> {
  const probeFailed = (detail: string) =>
    new NotificationRegistrationError({ kind: 'pluginProbeFailed', detail });
  const list = await run(listCommand);
  if (list.exitStatus !== 0) throw probeFailed(`plugin list exited ${list.exitStatus}`);
  let entries: ReturnType<typeof parsePluginList>;
  try {
    entries = parsePluginList(pluginListResult(list.stdout));
  } catch {
    entries = null;
  }
  if (entries === null) throw probeFailed('unreadable plugin list');
  const entry = agenticoEntry(entries, true);
  if (!entry?.pluginId) throw new NotificationRegistrationError({ kind: 'pluginNotInstalled' });
  const dir = await run(configDirCommand(entry.pluginId));
  if (dir.exitStatus !== 0) throw probeFailed(`config-dir exited ${dir.exitStatus}`);
  // Login-shell noise can precede the answer: the directory is the last absolute-path line.
  const lines = dir.stdout.split('\n').map((line) => line.trim());
  const path = lines.reverse().find((line) => line.startsWith('/'));
  if (path === undefined) throw probeFailed('no config dir printed');
  return path;
}
