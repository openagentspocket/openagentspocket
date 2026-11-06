import {
  PLUGIN_FEATURES,
  type PluginFeature,
  type PluginRequirement,
  type PluginVersion,
  parsePluginVersion,
  pluginRequirements,
} from './plugin-version';

/** The Agentico plugin's id. */
export const AGENTICO_PLUGIN_ID = 'agentico';
/** Ids the plugin shipped under before, newest first. */
export const LEGACY_PLUGIN_IDS: readonly string[] = ['herdr-mobile.pairing'];
/** The current id, then the legacy ids. */
export const KNOWN_PLUGIN_IDS: readonly string[] = [AGENTICO_PLUGIN_ID, ...LEGACY_PLUGIN_IDS];

/**
 * The GitHub repository `herdr plugin install` fetches.
 */
export const PLUGIN_REPOSITORY = 'openagentspocket/openagentspocket';
/** Where the installer scripts (`packages/plugin/install`) are served from. */
export const INSTALLER_BASE_URL = 'https://openagentspocket.com';
/** The generated branch the plugin ships from. */
export const PLUGIN_BRANCH = 'plugin';

export function pluginInstallArguments(repository: string = PLUGIN_REPOSITORY): string[] {
  return ['plugin', 'install', repository, '--ref', PLUGIN_BRANCH, '--yes'];
}

export type InstallerPlatform = 'unix' | 'windows';

/** The one-line installer a machine runs to set up the plugin and show its Pairing Code. */
export function installerCommand(
  platform: InstallerPlatform,
  baseUrl: string = INSTALLER_BASE_URL,
): string {
  return platform === 'windows'
    ? `irm ${baseUrl}/install.ps1 | iex`
    : `curl -fsSL ${baseUrl}/install.sh | sh`;
}

/** One entry of herdr's plugin list (`plugin.list` or `herdr plugin list --json`). */
export interface PluginListEntry {
  readonly pluginId: string | null;
  readonly pluginRoot: string | null;
  readonly version: string | null;
  /** A missing `enabled` reads as enabled. */
  readonly enabled: boolean | null;
  readonly source: {
    readonly kind: string | null;
    readonly owner: string | null;
    readonly repo: string | null;
  } | null;
  readonly warnings: readonly string[] | null;
}

function field<T>(raw: Record<string, unknown>, key: string, type: 'string' | 'boolean'): T | null {
  const value = raw[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== type) throw new TypeError(key);
  return value as T;
}

function parseEntry(value: unknown): PluginListEntry {
  if (typeof value !== 'object' || value === null) throw new TypeError('entry');
  const raw = value as Record<string, unknown>;
  let source: PluginListEntry['source'] = null;
  if (raw.source !== undefined && raw.source !== null) {
    if (typeof raw.source !== 'object') throw new TypeError('source');
    const rawSource = raw.source as Record<string, unknown>;
    source = {
      kind: field<string>(rawSource, 'kind', 'string'),
      owner: field<string>(rawSource, 'owner', 'string'),
      repo: field<string>(rawSource, 'repo', 'string'),
    };
  }
  let warnings: string[] | null = null;
  if (raw.warnings !== undefined && raw.warnings !== null) {
    if (!Array.isArray(raw.warnings) || raw.warnings.some((w) => typeof w !== 'string')) {
      throw new TypeError('warnings');
    }
    warnings = raw.warnings as string[];
  }
  return {
    pluginId: field<string>(raw, 'plugin_id', 'string'),
    pluginRoot: field<string>(raw, 'plugin_root', 'string'),
    version: field<string>(raw, 'version', 'string'),
    enabled: field<boolean>(raw, 'enabled', 'boolean'),
    source,
    warnings,
  };
}

/**
 * Reads a plugin list result (`{ plugins: [...] }`), keeping only the fields
 * the app uses. null when a field the app reads has the wrong type.
 */
export function parsePluginList(result: unknown): PluginListEntry[] | null {
  if (typeof result !== 'object' || result === null) return null;
  const { plugins } = result as Record<string, unknown>;
  if (!Array.isArray(plugins)) return null;
  try {
    return plugins.map(parseEntry);
  } catch {
    return null;
  }
}

const isEnabled = (entry: PluginListEntry) => entry.enabled !== false;

/** Every Agentico plugin entry, in `KNOWN_PLUGIN_IDS` order. */
export function agenticoEntries(entries: readonly PluginListEntry[]): PluginListEntry[] {
  return KNOWN_PLUGIN_IDS.flatMap((id) => entries.find((entry) => entry.pluginId === id) ?? []);
}

/**
 * The entry herdr runs hooks for, so the one Notification Registration writes
 * to: the first known id that is enabled. Unless `enabledOnly`, a disabled
 * entry stands in when none is enabled, so a switched-off plugin reads as
 * disabled rather than absent.
 */
export function agenticoEntry(
  entries: readonly PluginListEntry[],
  enabledOnly: boolean,
): PluginListEntry | null {
  const known = agenticoEntries(entries);
  return known.find(isEnabled) ?? (enabledOnly ? null : (known[0] ?? null));
}

export type PluginSource = 'github' | 'local' | 'unknown';

function sourceOf(entry: PluginListEntry): PluginSource {
  const kind = entry.source?.kind;
  return kind === 'github' || kind === 'local' ? kind : 'unknown';
}

/** The Agentico plugin as herdr reports it on one Host. */
export interface PluginInstallation {
  readonly pluginId: string;
  readonly pluginRoot: string | null;
  /** The manifest's version string as herdr reported it. */
  readonly version: string;
  readonly isEnabled: boolean;
  readonly source: PluginSource;
  /** herdr kept its last registry entry, so `version` may be stale. */
  readonly hasManifestWarning: boolean;
  /** Legacy ids still installed and enabled beside the current id: both run hooks. */
  readonly leftoverLegacyIds: readonly string[];
  /** Beside an enabled legacy-id plugin, the source of the disabled current id. */
  readonly disabledCurrentIdSource: PluginSource | null;
  /** `owner/repo` of a GitHub install, when herdr reports it. */
  readonly repository: string | null;
}

/** An installation with the defaults of a current, enabled GitHub install. */
export function pluginInstallation(
  fields: Pick<PluginInstallation, 'version'> & Partial<PluginInstallation>,
): PluginInstallation {
  return {
    pluginId: AGENTICO_PLUGIN_ID,
    pluginRoot: null,
    isEnabled: true,
    source: 'github',
    hasManifestWarning: false,
    leftoverLegacyIds: [],
    disabledCurrentIdSource: null,
    repository: PLUGIN_REPOSITORY,
    ...fields,
  };
}

/** The installation herdr's list describes, or null when the plugin is absent. */
export function installationFromList(
  entries: readonly PluginListEntry[],
): PluginInstallation | null {
  const entry = agenticoEntry(entries, false);
  if (!entry?.pluginId) return null;
  const known = agenticoEntries(entries);
  const isCurrent = entry.pluginId === AGENTICO_PLUGIN_ID;
  const disabledCurrent = isCurrent
    ? undefined
    : known.find((e) => e.pluginId === AGENTICO_PLUGIN_ID && !isEnabled(e));
  const { owner, repo } = entry.source ?? {};
  return {
    pluginId: entry.pluginId,
    pluginRoot: entry.pluginRoot,
    version: entry.version ?? '',
    isEnabled: isEnabled(entry),
    source: sourceOf(entry),
    hasManifestWarning: (entry.warnings ?? []).some((w) => w.startsWith('manifest unavailable')),
    leftoverLegacyIds: isCurrent
      ? known
          .filter((e) => e.pluginId !== entry.pluginId && isEnabled(e))
          .flatMap((e) => e.pluginId ?? [])
      : [],
    disabledCurrentIdSource: disabledCurrent ? sourceOf(disabledCurrent) : null,
    repository: owner != null && repo != null ? `${owner}/${repo}` : null,
  };
}

/** Installed under a name the plugin used before 0.4.0. */
export function isLegacyPluginId(installation: PluginInstallation): boolean {
  return installation.pluginId !== AGENTICO_PLUGIN_ID;
}

/**
 * Whether an install may replace this plugin: a GitHub install of `repository`
 * whose version herdr read from the manifest itself. A fork's install would
 * quietly move to this repository, and after a manifest warning the version may
 * be stale, so a downgrade could not be ruled out.
 */
export function isReplaceableByInstall(
  installation: PluginInstallation,
  repository: string = PLUGIN_REPOSITORY,
): boolean {
  return (
    installation.source === 'github' &&
    installation.repository?.toLowerCase() === repository.toLowerCase() &&
    !installation.hasManifestWarning &&
    parsePluginVersion(installation.version) !== null
  );
}

/** What one Host's plugin read established. */
export type PluginStatus =
  | { readonly kind: 'checking' }
  /** The plugin does not run on native Windows Hosts. */
  | { readonly kind: 'unsupportedPlatform' }
  /** The Host could not be asked or answered uselessly: nothing is known. */
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'notInstalled' }
  | { readonly kind: 'installed'; readonly installation: PluginInstallation };

/** Maps one plugin read: a feature the platform lacks is unsupported, any other failure unknown. */
export function pluginStatusFromRead(
  read: { ok: true; installation: PluginInstallation | null } | { ok: false; error: unknown },
): PluginStatus {
  if (read.ok) {
    return read.installation
      ? { kind: 'installed', installation: read.installation }
      : { kind: 'notInstalled' };
  }
  const kind = (read.error as { kind?: unknown } | null)?.kind;
  return kind === 'hostFeatureUnavailable'
    ? { kind: 'unsupportedPlatform' }
    : { kind: 'unavailable' };
}

/** The installed version when known to be current: enabled, fresh manifest, parseable. */
export function confirmedPluginVersion(status: PluginStatus): PluginVersion | null {
  if (status.kind !== 'installed') return null;
  const { installation } = status;
  if (!installation.isEnabled || installation.hasManifestWarning) return null;
  return parsePluginVersion(installation.version);
}

/** The `features` the confirmed plugin lacks; empty when unknown. */
export function statusRequirements(
  status: PluginStatus,
  features: readonly PluginFeature[] = PLUGIN_FEATURES,
): PluginRequirement[] {
  const version = confirmedPluginVersion(status);
  return version ? pluginRequirements(features, version) : [];
}

/** Notification settings' notes; Live Activity notes only while it is on. */
export function notificationRequirements(
  status: PluginStatus,
  liveActivityEnabled: boolean,
): PluginRequirement[] {
  const live: PluginFeature[] = liveActivityEnabled
    ? ['liveActivityUpdates', 'liveActivityRows']
    : [];
  return statusRequirements(status, ['sessionScopedNotifications', ...live]);
}

/** One change the app can make to a Host's plugin. Plugin ids are always known literals. */
export type PluginStep =
  | { readonly kind: 'install' }
  | { readonly kind: 'uninstall'; readonly pluginId: string }
  | { readonly kind: 'enable'; readonly pluginId: string };

/** herdr CLI arguments; enable goes through the session's `plugin.enable` request instead. */
export function pluginStepArguments(
  step: PluginStep,
  repository = PLUGIN_REPOSITORY,
): string[] | null {
  switch (step.kind) {
    case 'install':
      return pluginInstallArguments(repository);
    case 'uninstall':
      return ['plugin', 'uninstall', step.pluginId];
    case 'enable':
      return null;
  }
}
