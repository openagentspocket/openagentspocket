import { describe, expect, it } from 'vitest';
import vector from '../../../plugin/test-vectors/plugin-version-v1.json';
import {
  notificationRequirements,
  type PluginStatus,
  pluginInstallation,
  statusRequirements,
} from './plugin-installation';
import {
  BUNDLED_PLUGIN_VERSION,
  comparePluginVersions,
  formatPluginVersion,
  isPluginFeatureSupported,
  PLUGIN_FEATURE_MINIMUM,
  PLUGIN_FEATURES,
  type PluginFeature,
  parsePluginVersion,
  pluginVersion,
} from './plugin-version';

const installed = (version: string, fields = {}): PluginStatus => ({
  kind: 'installed',
  installation: pluginInstallation({ version, ...fields }),
});
const features = (status: PluginStatus, list: readonly PluginFeature[] = PLUGIN_FEATURES) =>
  statusRequirements(status, list).map((r) => r.feature);

describe('plugin version', () => {
  it.each([
    ['0.6.0', [0, 6, 0]],
    ['1.12.3', [1, 12, 3]],
    ['0.6', [0, 6, 0]],
    ['0.7.0-beta.1', [0, 7, 0]],
    ['0.7.0+abc', [0, 7, 0]],
  ])('parses %s', (raw, [major, minor, patch]) => {
    expect(parsePluginVersion(raw)).toEqual({ major, minor, patch });
  });

  it.each(['', '0', 'v0.6.0', '0.6.0.1', '0..6', '0.6.x', '-1.0.0', ' 0.6.0', '０.6.0'])(
    'rejects %j',
    (raw) => expect(parsePluginVersion(raw)).toBeNull(),
  );

  it('compares numerically by component', () => {
    expect(comparePluginVersions(pluginVersion(0, 5, 9), pluginVersion(0, 6, 0))).toBeLessThan(0);
    expect(comparePluginVersions(pluginVersion(0, 10, 0), pluginVersion(0, 9, 3))).toBeGreaterThan(
      0,
    );
    expect(comparePluginVersions(pluginVersion(1, 0, 0), pluginVersion(0, 99, 99))).toBeGreaterThan(
      0,
    );
    expect(formatPluginVersion(pluginVersion(0, 6, 0))).toBe('0.6.0');
  });

  // The plugin's Node tests pin herdr-plugin.toml to the same vector, so a
  // plugin release cannot leave the app recommending the previous one.
  it('bundles the version the shared vector names', () => {
    expect(parsePluginVersion(vector.version)).toEqual(BUNDLED_PLUGIN_VERSION);
    expect(formatPluginVersion(BUNDLED_PLUGIN_VERSION)).toBe(vector.version);
    for (const feature of PLUGIN_FEATURES) {
      expect(
        comparePluginVersions(PLUGIN_FEATURE_MINIMUM[feature], BUNDLED_PLUGIN_VERSION),
      ).toBeLessThanOrEqual(0);
    }
  });
});

describe('plugin feature requirements', () => {
  it.each<[string, boolean, PluginFeature[]]>([
    ['0.3.0', true, ['sessionScopedNotifications', 'liveActivityUpdates']],
    ['0.4.0', true, ['sessionScopedNotifications', 'liveActivityRows']],
    ['0.5.0', true, ['sessionScopedNotifications']],
    ['0.3.0', false, ['sessionScopedNotifications']],
    ['0.6.0', true, []],
  ])(
    'notification settings for plugin %s (Live Activity %s) note %j',
    (version, live, expected) => {
      const requirements = notificationRequirements(installed(version), live);
      expect(requirements.map((r) => r.feature)).toEqual(expected);
      for (const r of requirements) expect(formatPluginVersion(r.installed)).toBe(version);
    },
  );

  it('Claude Code Accounts need 0.8.0', () => {
    expect(PLUGIN_FEATURE_MINIMUM.claudeAccounts).toEqual(pluginVersion(0, 8, 0));
    expect(isPluginFeatureSupported('claudeAccounts', pluginVersion(0, 7, 1))).toBe(false);
    expect(isPluginFeatureSupported('claudeAccounts', pluginVersion(0, 8, 0))).toBe(true);
    expect(features(installed('0.7.1'), ['usage', 'claudeAccounts'])).toEqual(['claudeAccounts']);
    expect(features(installed('0.8.0'))).toEqual(['approvalActions']);
  });

  it('Approving from notifications needs 0.9.0', () => {
    expect(isPluginFeatureSupported('approvalActions', pluginVersion(0, 8, 1))).toBe(false);
    expect(isPluginFeatureSupported('approvalActions', pluginVersion(0, 9, 0))).toBe(true);
    expect(features(installed('0.9.0'))).toEqual(['liveActivityApprovals']);
  });

  it('Live Activity approvals need 0.10.0 and fold into the approvals note', () => {
    expect(features(installed('0.9.0'), ['approvalActions', 'liveActivityApprovals'])).toEqual([
      'liveActivityApprovals',
    ]);
    expect(features(installed('0.8.1'), ['approvalActions', 'liveActivityApprovals'])).toEqual([
      'approvalActions',
    ]);
    expect(features(installed('0.10.0'))).toEqual([]);
  });

  it('needs a confirmed version to say anything', () => {
    expect(features(installed('0.3.0'), ['sidebarFields'])).toEqual(['sidebarFields']);
    expect(features(installed('0.4.0'), ['sidebarFields'])).toEqual([]);
    const unconfirmed: PluginStatus[] = [
      { kind: 'checking' },
      { kind: 'unavailable' },
      { kind: 'notInstalled' },
      { kind: 'unsupportedPlatform' },
      installed('0.3.0', { isEnabled: false }),
      installed('0.3.0', { hasManifestWarning: true }),
      installed('dev'),
    ];
    for (const status of unconfirmed) expect(features(status)).toEqual([]);
  });
});
