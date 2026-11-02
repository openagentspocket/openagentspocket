import { describe, expect, it } from 'vitest';
import {
  agenticoEntry,
  installationFromList,
  isLegacyPluginId,
  type PluginListEntry,
  parsePluginList,
  pluginInstallation,
  pluginStatusFromRead,
  pluginStepArguments,
} from './plugin-installation';

/** herdr 0.9.3's `plugin.list` result for a linked checkout, manifest arrays and all. */
const LIVE_RESULT = JSON.parse(
  '{"plugins":[{"actions":[{"command":["node","src/pair-action.js"],"contexts":["global"],"id":"pair","title":"Pair"}],"build":[{"command":["npm","ci"]}],"enabled":true,"events":[],"manifest_path":"/u/agentico/plugin/herdr-plugin.toml","min_herdr_version":"0.7.5","name":"agentico","platforms":["linux","macos"],"plugin_id":"agentico","plugin_root":"/u/agentico/plugin","source":{"kind":"local"},"startup":[],"version":"0.6.0"}],"type":"plugin_list"}',
);

function decode(plugins: string) {
  const entries = parsePluginList(JSON.parse(`{"plugins":[${plugins}]}`));
  expect(entries).not.toBeNull();
  return installationFromList(entries as PluginListEntry[]);
}

describe('plugin list', () => {
  it("decodes herdr's live answer", () => {
    const entries = parsePluginList(LIVE_RESULT);
    expect(installationFromList(entries ?? [])).toEqual(
      pluginInstallation({
        pluginRoot: '/u/agentico/plugin',
        version: '0.6.0',
        source: 'local',
        repository: null,
      }),
    );
  });

  it('prefers the current id and ignores other plugins', () => {
    expect(
      decode(
        '{"plugin_id":"other","version":"9.9.9"},{"plugin_id":"agentico","version":"0.5.0","source":{"kind":"github"}}',
      ),
    ).toEqual(pluginInstallation({ version: '0.5.0', repository: null }));
  });

  it('names an enabled legacy id beside the current one as a leftover', () => {
    expect(
      decode(
        '{"plugin_id":"herdr-mobile.pairing","version":"0.3.0","source":{"kind":"github"}},{"plugin_id":"agentico","version":"0.6.0","source":{"kind":"github"}}',
      ),
    ).toEqual(
      pluginInstallation({
        version: '0.6.0',
        leftoverLegacyIds: ['herdr-mobile.pairing'],
        repository: null,
      }),
    );
    expect(
      decode(
        '{"plugin_id":"herdr-mobile.pairing","version":"0.3.0","enabled":false},{"plugin_id":"agentico","version":"0.6.0"}',
      )?.leftoverLegacyIds,
    ).toEqual([]);
  });

  it('lets an enabled legacy id outrank a disabled current one', () => {
    const installation = decode(
      '{"plugin_id":"agentico","version":"0.6.0","enabled":false},{"plugin_id":"herdr-mobile.pairing","version":"0.3.0"}',
    );
    expect(installation?.pluginId).toBe('herdr-mobile.pairing');
    expect(installation?.isEnabled).toBe(true);
    const entries = parsePluginList(
      JSON.parse(
        '{"plugins":[{"plugin_id":"agentico","enabled":false},{"plugin_id":"herdr-mobile.pairing"}]}',
      ),
    ) as PluginListEntry[];
    expect(agenticoEntry(entries, true)?.pluginId).toBe('herdr-mobile.pairing');
    expect(agenticoEntry(entries.slice(0, 1), true)).toBeNull();
  });

  it("records the disabled current id's source beside an enabled legacy id", () => {
    const legacy = '{"plugin_id":"herdr-mobile.pairing","version":"0.3.0"}';
    expect(
      decode(
        `{"plugin_id":"agentico","version":"0.6.0","enabled":false,"source":{"kind":"github"}},${legacy}`,
      )?.disabledCurrentIdSource,
    ).toBe('github');
    expect(
      decode(
        `{"plugin_id":"agentico","version":"0.6.0","enabled":false,"source":{"kind":"local"}},${legacy}`,
      )?.disabledCurrentIdSource,
    ).toBe('local');
  });

  it.each([
    '{"plugin_id":"herdr-mobile.pairing","version":"0.3.0"}',
    '{"plugin_id":"herdr-mobile.pairing","version":"0.3.0"},{"plugin_id":"agentico","version":"0.6.0","enabled":true}',
    '{"plugin_id":"herdr-mobile.pairing","version":"0.3.0"},{"plugin_id":"agentico","version":"0.6.0"}',
    '{"plugin_id":"agentico","version":"0.6.0","enabled":false}',
    '{"plugin_id":"herdr-mobile.pairing","version":"0.3.0","enabled":false},{"plugin_id":"agentico","version":"0.6.0","enabled":false}',
  ])('records no disabled current id otherwise: %s', (plugins) => {
    expect(decode(plugins)?.disabledCurrentIdSource).toBeNull();
  });

  it('reports a legacy id and a disabled plugin rather than calling them absent', () => {
    const legacy = decode('{"plugin_id":"herdr-mobile.pairing","version":"0.3.0","enabled":false}');
    expect(legacy && isLegacyPluginId(legacy)).toBe(true);
    expect(legacy?.isEnabled).toBe(false);
    expect(legacy?.source).toBe('unknown');
  });

  it('reads an empty list as not installed', () => {
    expect(decode('')).toBeNull();
    expect(decode('{"plugin_id":"other","version":"1.0.0"}')).toBeNull();
  });

  it('tolerates missing fields and flags a stale manifest', () => {
    const stale = decode(
      '{"plugin_id":"agentico","warnings":["manifest unavailable: missing file"]}',
    );
    expect(stale).toMatchObject({ version: '', isEnabled: true, hasManifestWarning: true });
    expect(
      decode('{"plugin_id":"agentico","version":"0.6.0","warnings":["slow build"]}')
        ?.hasManifestWarning,
    ).toBe(false);
  });

  it("reads a GitHub install's repository only when herdr names both parts", () => {
    expect(
      decode(
        '{"plugin_id":"agentico","version":"0.5.0","source":{"kind":"github","owner":"someone","repo":"Agentico","subdir":"plugin"}}',
      )?.repository,
    ).toBe('someone/Agentico');
    expect(
      decode('{"plugin_id":"agentico","version":"0.5.0","source":{"kind":"github"}}')?.repository,
    ).toBeNull();
  });

  it('refuses a list whose fields have the wrong types', () => {
    expect(parsePluginList({ plugins: [{ plugin_id: 5 }] })).toBeNull();
    expect(parsePluginList({ plugins: [{ enabled: 'yes' }] })).toBeNull();
    expect(parsePluginList({ plugins: [{ warnings: [1] }] })).toBeNull();
    expect(parsePluginList({})).toBeNull();
  });
});

describe('plugin status reads', () => {
  it('maps read outcomes to statuses', () => {
    const installation = pluginInstallation({ version: '0.6.0' });
    expect(pluginStatusFromRead({ ok: true, installation: null })).toEqual({
      kind: 'notInstalled',
    });
    expect(pluginStatusFromRead({ ok: true, installation })).toEqual({
      kind: 'installed',
      installation,
    });
    expect(
      pluginStatusFromRead({
        ok: false,
        error: { kind: 'hostFeatureUnavailable', feature: 'plugin' },
      }),
    ).toEqual({ kind: 'unsupportedPlatform' });
    // A refusal or a garbled answer says nothing about the plugin.
    for (const error of [
      { kind: 'apiRejected' },
      { kind: 'malformedResponse' },
      { kind: 'timedOut' },
      null,
    ]) {
      expect(pluginStatusFromRead({ ok: false, error })).toEqual({ kind: 'unavailable' });
    }
  });

  it('runs install and uninstall through the CLI, enable through the session', () => {
    expect(pluginStepArguments({ kind: 'install' }, 'example/agentico')).toEqual([
      'plugin',
      'install',
      'example/agentico',
      '--ref',
      'plugin',
      '--yes',
    ]);
    expect(pluginStepArguments({ kind: 'uninstall', pluginId: 'herdr-mobile.pairing' })).toEqual([
      'plugin',
      'uninstall',
      'herdr-mobile.pairing',
    ]);
    expect(pluginStepArguments({ kind: 'enable', pluginId: 'agentico' })).toBeNull();
  });
});
