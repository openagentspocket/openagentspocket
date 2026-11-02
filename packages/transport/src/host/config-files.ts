import {
  ACCOUNT_FILE_NAME,
  CONFIG_FILE_NAME,
  failWith,
  NotificationRegistrationError,
  type NotificationTransport,
  REGISTRATION_FILE_NAME,
  resolvePluginConfigDir,
  TransportFailure,
} from '@openagentspocket/core';
import { type Sftp, SshError } from 'agentico-ssh';
import { SharedOperation } from '../shared-operation';
import type { SshTransport } from '../transport';
import { requirePosixHost } from './environment';
import { cLocale, launcherCommand, missingBinaryError, wrappingBareHerdr } from './shell';

export const SIDEBAR_LAYOUT_FILE_NAME = 'sidebar.json';

/** Owner-only: the files hold Notification Keys and account labels. */
const DIRECTORY_PERMISSIONS = 0o700;
const FILE_PERMISSIONS = 0o600;

/** Files in the Agentico plugin's config dir on one Host, written privately and atomically. */
export interface PluginConfigFiles extends NotificationTransport {
  readSidebarLayout(): Promise<Uint8Array | null>;
  readUsageAccountFile(): Promise<Uint8Array | null>;
  replaceUsageAccountFile(data: Uint8Array): Promise<void>;
}

/** Maps an SSH failure of a file operation: link failures stay transport errors, the rest ours. */
function fileFailure(
  transport: SshTransport,
  kind: 'readFailed' | 'writeFailed',
  thrown: unknown,
): Error {
  if (thrown instanceof TransportFailure || thrown instanceof NotificationRegistrationError) {
    return thrown;
  }
  if (
    thrown instanceof SshError &&
    ['timedOut', 'cancelled', 'connectionInvalidated', 'closed'].includes(thrown.code)
  ) {
    return transport.fail(thrown);
  }
  const detail =
    thrown instanceof SshError && thrown.code === 'sftpUnavailable'
      ? 'SFTP is unavailable.'
      : 'The SSH file operation failed.';
  return new NotificationRegistrationError({ kind, detail });
}

/** The plugin's config files, with the directory resolved from the Host's herdr once. */
export function pluginConfigFiles(transport: SshTransport): PluginConfigFiles {
  const endpoint = transport.settings.endpoint ?? null;
  const directory = new SharedOperation<string>(true);

  const run = async (command: string) => {
    const result = await transport.runExec(cLocale(wrappingBareHerdr(command)));
    const missing = missingBinaryError(result.exitCode, command, endpoint);
    if (missing) throw failWith(missing);
    return { exitStatus: result.exitCode, stdout: result.stdout };
  };
  const listCommand =
    (endpoint && launcherCommand(endpoint, 'plugin list --json')) || 'herdr plugin list --json';
  const configDirCommand = (pluginId: string) =>
    (endpoint && launcherCommand(endpoint, `plugin config-dir ${pluginId}`)) ||
    `herdr plugin config-dir ${pluginId}`;

  const configDirectory = () => {
    requirePosixHost(transport, 'Plugin configuration and notification registration');
    return directory.value(() => resolvePluginConfigDir(run, listCommand, configDirCommand));
  };

  /** One SFTP channel for one operation, closed after it. */
  const withSftp = <T>(use: (sftp: Sftp) => Promise<T>): Promise<T> =>
    transport.admission.withChannel('ordinarySession', async () => {
      const sftp = await transport.session.sftp({ timeoutMs: transport.requestBudgetMs });
      try {
        return await use(sftp);
      } finally {
        await sftp.close().catch(() => undefined);
      }
    });

  const read = async (name: string): Promise<Uint8Array | null> => {
    const dir = await configDirectory();
    try {
      return await withSftp(async (sftp) => {
        await sftp.chmod(dir, DIRECTORY_PERMISSIONS);
        const data = await sftp.read(`${dir}/${name}`);
        if (data) await sftp.chmod(`${dir}/${name}`, FILE_PERMISSIONS);
        return data;
      });
    } catch (thrown) {
      throw fileFailure(transport, 'readFailed', thrown);
    }
  };

  const replace = async (name: string, data: Uint8Array): Promise<void> => {
    const dir = await configDirectory();
    try {
      await withSftp(async (sftp) => {
        await sftp.chmod(dir, DIRECTORY_PERMISSIONS);
        // The client stages a sibling file and renames it over the target.
        await sftp.write(`${dir}/${name}`, data, { replace: true, permissions: FILE_PERMISSIONS });
      });
    } catch (thrown) {
      throw fileFailure(transport, 'writeFailed', thrown);
    }
  };

  return {
    readRegistration: () => read(REGISTRATION_FILE_NAME),
    replaceRegistration: (data) => replace(REGISTRATION_FILE_NAME, data),
    readConfig: () => read(CONFIG_FILE_NAME),
    replaceConfig: (data) => replace(CONFIG_FILE_NAME, data),
    readSidebarLayout: () => read(SIDEBAR_LAYOUT_FILE_NAME),
    readUsageAccountFile: () => read(ACCOUNT_FILE_NAME),
    replaceUsageAccountFile: (data) => replace(ACCOUNT_FILE_NAME, data),
  };
}
