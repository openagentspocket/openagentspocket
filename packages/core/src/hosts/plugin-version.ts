/** An Agentico plugin release number, `major.minor.patch`. */
export interface PluginVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export function pluginVersion(major: number, minor: number, patch: number): PluginVersion {
  return { major, minor, patch };
}

/**
 * Parses a manifest `version` such as `0.6.0`. A missing patch reads as 0; a
 * pre-release or build suffix (`-beta.1`, `+abc`) is ignored, so a pre-release
 * compares equal to its release. Anything else is null.
 */
export function parsePluginVersion(text: string): PluginVersion | null {
  const core = text.split(/[-+]/, 1)[0] ?? '';
  const parts = core.split('.');
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((part) => /^[0-9]+$/.test(part))) return null;
  const numbers = parts.map(Number);
  if (!numbers.every(Number.isSafeInteger)) return null;
  const [major = 0, minor = 0, patch = 0] = numbers;
  return { major, minor, patch };
}

export function formatPluginVersion(version: PluginVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

/** Negative when `a` is older than `b`, zero when equal, positive when newer. */
export function comparePluginVersions(a: PluginVersion, b: PluginVersion): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/**
 * The plugin release this app build ships alongside. The shared
 * `packages/plugin/test-vectors/plugin-version-v1.json` pins it: a plugin
 * release bumps both. A Host with a newer plugin counts as current.
 */
export const BUNDLED_PLUGIN_VERSION: PluginVersion = { major: 0, minor: 11, patch: 0 };

/**
 * App features that need a recent enough plugin. 0.3.0 gained the Live
 * Activity hook and 0.4.0 its row layout without a version change, so those
 * two only say the feature may be missing.
 */
export const PLUGIN_FEATURES = [
  /** `sidebar.json`: Sync from plugin and herdr's sidebar fields. */
  'sidebarFields',
  /** The activity hook pushes Live Activity updates while the app is suspended. */
  'liveActivityUpdates',
  /** Pushed Live Activity updates carry the Host's Agent List Fields. */
  'liveActivityRows',
  /** Registrations scoped to a herdr session. */
  'sessionScopedNotifications',
  /** Host-side Usage Limits and Token Usage. */
  'usage',
  /** Usage per Claude Code Account, and the Account file the app edits. */
  'claudeAccounts',
  /** Blocked notifications carry the approval preview (Approve/Deny). */
  'approvalActions',
  /** The Live Activity can offer Approve and Deny. */
  'liveActivityApprovals',
] as const;
export type PluginFeature = (typeof PLUGIN_FEATURES)[number];

export const PLUGIN_FEATURE_MINIMUM: Readonly<Record<PluginFeature, PluginVersion>> = {
  sidebarFields: pluginVersion(0, 4, 0),
  liveActivityUpdates: pluginVersion(0, 4, 0),
  liveActivityRows: pluginVersion(0, 5, 0),
  sessionScopedNotifications: pluginVersion(0, 6, 0),
  usage: pluginVersion(0, 7, 0),
  claudeAccounts: pluginVersion(0, 8, 0),
  approvalActions: pluginVersion(0, 9, 0),
  liveActivityApprovals: pluginVersion(0, 10, 0),
};

export function isPluginFeatureSupported(feature: PluginFeature, version: PluginVersion): boolean {
  return comparePluginVersions(version, PLUGIN_FEATURE_MINIMUM[feature]) >= 0;
}

/** A feature a Host's plugin is too old for; the UI words it from these fields. */
export interface PluginRequirement {
  readonly feature: PluginFeature;
  readonly minimum: PluginVersion;
  readonly installed: PluginVersion;
}

/**
 * The `features` that `installed` lacks. A plugin without background Live
 * Activity updates has no row layout for them either, and one without approval
 * previews has no Live Activity asks, so those second notes are left out.
 */
export function pluginRequirements(
  features: readonly PluginFeature[],
  installed: PluginVersion,
): PluginRequirement[] {
  const missing = features.filter((feature) => !isPluginFeatureSupported(feature, installed));
  return missing
    .filter((f) => f !== 'liveActivityRows' || !missing.includes('liveActivityUpdates'))
    .filter((f) => f !== 'liveActivityApprovals' || !missing.includes('approvalActions'))
    .map((feature) => ({ feature, minimum: PLUGIN_FEATURE_MINIMUM[feature], installed }));
}
