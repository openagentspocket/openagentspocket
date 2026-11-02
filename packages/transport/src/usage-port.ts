import {
  failures,
  failWith,
  type HerdrEndpoint,
  herdrScriptCommand,
  installationFromList,
  type PluginInstallation,
  parsePluginList,
  parseUsageProbe,
  shellWord,
  TransportFailure,
  type UsageHostPort,
  type UsageQueryArgs,
  type UsageReport,
  usageProbeScript,
} from '@openagentspocket/core';
import { type Sftp, utf8Decode, utf8Encode } from 'agentico-ssh';
import type { SshTransport } from './transport';

/** The plugin's Accounts file in its config directory. */
export const ACCOUNT_FILE_NAME = 'usage-accounts.json';

/** The Host-side budget of one Usage query (Swift: 10 s deadline, 8 s remote). */
export const USAGE_QUERY_TIMEOUT_MS = 10_000;
const FILE_PERMISSIONS = 0o600;

export interface UsagePortOptions {
  /** A paired endpoint: herdr runs through its launcher and socket. */
  readonly endpoint?: HerdrEndpoint | null;
  /** A named herdr session the plugin commands aim at. */
  readonly session?: string | null;
  readonly nonce?: () => string;
}

const randomNonce = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/**
 * The live `UsageHostPort` of one connected Host: the plugin listing is a herdr API request,
 * the query one bounded exec, and the Accounts file an atomic SFTP replace in the plugin's
 * config directory.
 */
export function usageHostPort(
  transport: SshTransport,
  options: UsagePortOptions = {},
): UsageHostPort {
  const endpoint = options.endpoint ?? null;
  const nonce = options.nonce ?? randomNonce;
  let configDir: string | null = null;

  const shell = (script: string) => `/bin/sh -c ${shellWord(script)}`;

  async function resolveConfigDir(): Promise<string> {
    if (configDir) return configDir;
    const plugin = await readPlugin();
    if (!plugin?.isEnabled) {
      throw failWith(failures.channelFailed('The Agentico plugin is not installed and enabled.'));
    }
    const { environment, command } = herdrScriptCommand(
      endpoint,
      `plugin config-dir ${shellWord(plugin.pluginId)}`,
    );
    const session = options.session ? `export HERDR_SESSION=${shellWord(options.session)}; ` : '';
    const result = await transport.runExec(shell(`${environment}; ${session}${command}`));
    if (result.exitCode !== 0) {
      throw failWith(failures.channelFailed(`plugin config-dir exited ${result.exitCode}`));
    }
    // Login-shell noise can precede the answer: the directory is the last absolute-path line.
    const path = result.stdout
      .split('\n')
      .map((line) => line.trim())
      .reverse()
      .find((line) => line.startsWith('/'));
    if (!path) throw failWith(failures.channelFailed('no config dir printed'));
    configDir = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
    return configDir;
  }

  async function withSftp<T>(run: (sftp: Sftp) => Promise<T>): Promise<T> {
    const sftp = await transport.session.sftp();
    try {
      return await run(sftp);
    } catch (error) {
      throw error instanceof TransportFailure ? error : transport.fail(error);
    } finally {
      await sftp.close().catch(() => undefined);
    }
  }

  async function readPlugin(): Promise<PluginInstallation | null> {
    const result = await transport.request('plugin.list', {});
    const entries = parsePluginList(result);
    if (entries === null) {
      throw failWith(failures.channelFailed('unreadable plugin list'));
    }
    return installationFromList(entries);
  }

  return {
    readPlugin,

    async query(args: UsageQueryArgs): Promise<UsageReport> {
      const id = nonce();
      const script = usageProbeScript({ ...args, nonce: id, endpoint });
      const result = await transport.runExec(shell(script), USAGE_QUERY_TIMEOUT_MS);
      return parseUsageProbe(result.stdout, id);
    },

    async readAccountFile(): Promise<string | null> {
      const dir = await resolveConfigDir();
      return withSftp(async (sftp) => {
        const bytes = await sftp.read(`${dir}/${ACCOUNT_FILE_NAME}`);
        return bytes === null ? null : utf8Decode(bytes);
      });
    },

    async replaceAccountFile(text: string): Promise<void> {
      const dir = await resolveConfigDir();
      await withSftp((sftp) =>
        sftp.write(`${dir}/${ACCOUNT_FILE_NAME}`, utf8Encode(text), {
          replace: true,
          permissions: FILE_PERMISSIONS,
        }),
      );
    },
  };
}
