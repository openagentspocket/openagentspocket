import {
  BUNDLED_PLUGIN_VERSION,
  comparePluginVersions,
  failures,
  failWith,
  HERDR_EXTRA_PATH,
  installationFromList,
  isReplaceableByInstall,
  PLUGIN_BRANCH,
  PLUGIN_REPOSITORY,
  type PluginInstallation,
  type PluginStep,
  type PluginVersion,
  parsePluginList,
  parsePluginVersion,
  parseUsageProbe,
  pluginStepArguments,
  type UsageReport,
  usageProbeScript,
} from '@openagentspocket/core';
import type { SshTransport } from '../transport';
import { type ExecLane, runBoundedScript } from './bounded-script';
import { requirePosixHost } from './environment';
import { bareStepCommand, checkPluginStep, pluginStepCommand } from './plugin-step';
import { cLocale } from './shell';

/** Plugin installs build with `npm ci`; they get a long budget. */
export const PLUGIN_INSTALL_TIMEOUT_MS = 180_000;

const randomNonce = () => Math.random().toString(16).slice(2, 14).padEnd(12, '0');

const PLUGIN_FEATURE = 'The Agentico plugin';

/** The Agentico plugin as the Host's herdr reports it; null when absent. */
export async function readPlugin(transport: SshTransport): Promise<PluginInstallation | null> {
  requirePosixHost(transport, PLUGIN_FEATURE);
  // No `plugin_id` filter: one listing covers the current and legacy ids.
  const result = await transport.request('plugin.list');
  const entries = parsePluginList(result);
  if (!entries)
    throw failWith(failures.malformedResponse('herdr returned an unreadable plugin list'));
  return installationFromList(entries);
}

/** The herdr session the Host's transport names; empty for the default one. */
export function sessionName(transport: SshTransport): string {
  const { socket } = transport.settings;
  return socket.kind === 'namedSession' ? socket.name : '';
}

/** Runs one step of the plugin change flow on the Host. */
export async function runPluginStep(transport: SshTransport, step: PluginStep): Promise<void> {
  requirePosixHost(transport, 'Changing the Agentico plugin');
  const args = pluginStepArguments(step);
  if (args === null) {
    if (step.kind === 'enable')
      await transport.request('plugin.enable', { plugin_id: step.pluginId });
    return;
  }
  const session = sessionName(transport);
  const endpoint = transport.settings.endpoint ?? null;
  const command = pluginStepCommand(args, {
    session,
    endpoint,
    findsNode: step.kind === 'install',
  });
  const result = await transport.runExec(cLocale(command), PLUGIN_INSTALL_TIMEOUT_MS);
  checkPluginStep(step, result, bareStepCommand(args, session), endpoint);
}

/** The branch the plugin installs from, fetched into a scratch repository removed afterwards. */
export function pluginBranchManifestCommand(repository = PLUGIN_REPOSITORY): string {
  const url = `https://github.com/${repository}.git`;
  return (
    `/bin/sh -c 'export PATH="${HERDR_EXTRA_PATH}:$PATH:$HOME/.nix-profile/bin:` +
    `/nix/var/nix/profiles/default/bin:/run/current-system/sw/bin"; ` +
    'export GIT_TERMINAL_PROMPT=0; ' +
    '__h_d=$(mktemp -d) || exit 1; cd "$__h_d" || { rm -rf "$__h_d"; exit 1; }; ' +
    'git init -q && git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=30 ' +
    `fetch -q --depth 1 ${url} ${PLUGIN_BRANCH} ` +
    '&& git show FETCH_HEAD:herdr-plugin.toml; __h_s=$?; ' +
    `cd / && rm -rf "$__h_d"; exit $__h_s'`
  );
}

/** The top-level `version = "X.Y.Z"` of a plugin manifest; tables after the first `[` do not count. */
export function manifestVersion(manifest: string): PluginVersion | null {
  for (const raw of manifest.split(/\r?\n|\r/)) {
    const line = raw.trim();
    if (line.startsWith('[')) return null;
    const equals = line.indexOf('=');
    if (equals < 0 || line.slice(0, equals).trim() !== 'version') continue;
    const quoted = line.slice(equals + 1).split('"');
    if (quoted.length < 3 || (quoted[0] ?? '').trim() !== '') return null;
    return parsePluginVersion(quoted[1] ?? '');
  }
  return null;
}

/** The Host could not fetch the plugin branch's manifest, or it named no version. */
export class PluginBranchVersionError extends Error {
  override readonly name = 'PluginBranchVersionError';
  constructor(
    readonly exitCode: number,
    /** What git printed, when it said why. */
    readonly output: string,
  ) {
    super('PluginBranchVersionError');
  }
}

/** The version the plugin branch ships, read from the Host (it fetches GitHub itself). */
export async function readPluginBranchVersion(transport: SshTransport): Promise<PluginVersion> {
  requirePosixHost(transport, PLUGIN_FEATURE);
  const result = await transport.runExec(
    cLocale(pluginBranchManifestCommand()),
    PLUGIN_INSTALL_TIMEOUT_MS,
  );
  const version = result.exitCode === 0 ? manifestVersion(result.stdout) : null;
  if (!version) throw new PluginBranchVersionError(result.exitCode, result.stderr.trim());
  return version;
}

/** Why an install was not run over what the Host has. */
export class PluginNotReplaceableError extends Error {
  override readonly name = 'PluginNotReplaceableError';
  constructor() {
    super('PluginNotReplaceableError');
  }
}

export type PluginInstallOutcome = 'installed' | 'upgraded' | 'current';

/**
 * The install/upgrade flow behind the plugin notice's action. An absent plugin is installed. A
 * present one is replaced only when it is this repository's GitHub install with a fresh version
 * (the gate: a linked checkout, a fork or a stale registry entry could be downgraded or moved);
 * one already at `target` is left alone.
 */
export async function installOrUpgradePlugin(
  transport: SshTransport,
  target: PluginVersion = BUNDLED_PLUGIN_VERSION,
): Promise<PluginInstallOutcome> {
  const installation = await readPlugin(transport);
  if (installation === null) {
    await runPluginStep(transport, { kind: 'install' });
    return 'installed';
  }
  if (!isReplaceableByInstall(installation)) throw new PluginNotReplaceableError();
  const installed = parsePluginVersion(installation.version);
  if (installed && comparePluginVersions(installed, target) >= 0) return 'current';
  await runPluginStep(transport, { kind: 'install' });
  return 'upgraded';
}

/** Runs the plugin's Usage query under its 10 s budget (8 s remote watchdog). */
export async function readAgentUsage(
  transport: SshTransport,
  query: { timeZone: string; claudeLimits: boolean; pluginRoot: string },
  options: { nonce?: string; lane?: ExecLane } = {},
): Promise<UsageReport> {
  const nonce = options.nonce ?? randomNonce();
  const script = usageProbeScript({
    ...query,
    nonce,
    endpoint: transport.settings.endpoint ?? null,
  });
  const result = await runBoundedScript(transport, script, {
    feature: 'Usage',
    deadlineMs: 10_000,
    remoteSeconds: 8,
    timeoutMarkerPrefix: '__AGENTICO_USAGE_TIMEOUT_',
    timedOut: { kind: 'hostFileTimedOut' },
    lane: options.lane,
  });
  return parseUsageProbe(result.stdout, nonce);
}
