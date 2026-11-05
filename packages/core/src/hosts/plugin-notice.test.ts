import { describe, expect, it } from 'vitest';
import { makeHerdrEndpoint } from './herdr-endpoint';
import {
  type PluginInstallation,
  type PluginStatus,
  type PluginStep,
  pluginInstallation,
} from './plugin-installation';
import { type PluginContext, type PluginNotice, pluginPresentation } from './plugin-notice';
import { type PluginFeature, pluginVersion } from './plugin-version';

const REPO = 'example/agentico';
const INSTALL = `herdr plugin install ${REPO} --ref plugin --yes`;
const LEGACY = 'herdr-mobile.pairing';
const v060 = pluginVersion(0, 6, 0);

const installation = (fields: Partial<PluginInstallation> & { version: string }) =>
  pluginInstallation({ repository: REPO, ...fields });
const installed = (fields: Partial<PluginInstallation> & { version: string }): PluginStatus => ({
  kind: 'installed',
  installation: installation(fields),
});
const present = (status: PluginStatus, context: Partial<PluginContext> = {}) =>
  pluginPresentation(status, { session: '', bundled: v060, repository: REPO, ...context });
const noticeOf = (status: PluginStatus, context: Partial<PluginContext> = {}): PluginNotice => {
  const { notice } = present(status, context);
  expect(notice).not.toBeNull();
  return notice as PluginNotice;
};
const noteFeatures = (notice: PluginNotice): PluginFeature[] => notice.notes.map((n) => n.feature);

describe('plugin notice matrix', () => {
  it('a session bridge names its backend and offers nothing to update', () => {
    const { value, notice } = present(installed({ version: '0.1.0+tmux' }));
    expect(value).toMatchObject({ kind: 'installed', version: 'tmux 0.1.0' });
    expect(notice).toBeNull();
  });

  it('shows only the value when there is nothing to do', () => {
    const cases: [PluginStatus, unknown][] = [
      [{ kind: 'checking' }, { kind: 'checking' }],
      [{ kind: 'unsupportedPlatform' }, { kind: 'unsupportedPlatform' }],
      [{ kind: 'unavailable' }, { kind: 'unknown' }],
      [
        installed({ version: '0.6.0' }),
        { kind: 'installed', version: '0.6.0', linkedLocally: false, disabled: false },
      ],
      // The plugin branch moved ahead of this build.
      [
        installed({ version: '0.7.0' }),
        { kind: 'installed', version: '0.7.0', linkedLocally: false, disabled: false },
      ],
      [
        installed({ version: '0.6.0', source: 'local' }),
        { kind: 'installed', version: '0.6.0', linkedLocally: true, disabled: false },
      ],
      // Unparseable: nothing to compare, so nothing to recommend.
      [
        installed({ version: 'dev' }),
        { kind: 'installed', version: 'dev', linkedLocally: false, disabled: false },
      ],
      [
        installed({ version: '' }),
        { kind: 'installed', version: null, linkedLocally: false, disabled: false },
      ],
    ];
    for (const [status, value] of cases) expect(present(status)).toEqual({ value, notice: null });
  });

  it('offers an older GitHub plugin the install command and what it lacks', () => {
    const notice = noticeOf(installed({ version: '0.4.0' }));
    expect(notice.tone).toBe('warning');
    expect(notice.message).toEqual({
      key: 'updateAvailable',
      installed: pluginVersion(0, 4, 0),
      bundled: v060,
    });
    expect(notice.commands).toEqual([INSTALL]);
    expect(noteFeatures(notice)).toEqual(['liveActivityRows', 'sessionScopedNotifications']);
    expect(notice.action).toEqual({ title: 'update', steps: [{ kind: 'install' }] });
  });

  it('still gives an unknown source the install command, without an action', () => {
    const notice = noticeOf(installed({ version: '0.5.0', source: 'unknown' }));
    expect(notice.commands).toEqual([INSTALL]);
    expect(notice.action).toBeNull();
  });

  it('gives an older linked plugin no install command (herdr refuses to replace it)', () => {
    const notice = noticeOf(installed({ version: '0.5.0', source: 'local' }));
    expect(notice.message).toEqual({ key: 'updateLinked', bundled: v060 });
    expect(notice.commands).toEqual([]);
    expect(noteFeatures(notice)).toEqual(['sessionScopedNotifications']);
  });

  it('removes a legacy id before installing, even when disabled', () => {
    const notice = noticeOf(installed({ pluginId: LEGACY, version: '0.3.0', isEnabled: false }));
    expect(
      present(installed({ pluginId: LEGACY, version: '0.3.0', isEnabled: false })).value,
    ).toEqual({
      kind: 'installed',
      version: '0.3.0',
      linkedLocally: false,
      disabled: false,
    });
    expect(notice.message).toEqual({ key: 'legacyId' });
    expect(notice.commands).toEqual([`herdr plugin uninstall ${LEGACY}`, INSTALL]);
    // The rows note folds into the updates note; old registrations do not carry over.
    expect(noteFeatures(notice)).toEqual([
      'sidebarFields',
      'liveActivityUpdates',
      'sessionScopedNotifications',
    ]);
    expect(notice.reenableNotifications).toBe(true);
    expect(notice.action).toBeNull();
  });

  it('turns a disabled current id on after the legacy id goes', () => {
    const notice = noticeOf(
      installed({ pluginId: LEGACY, version: '0.3.0', disabledCurrentIdSource: 'github' }),
      { session: 'work' },
    );
    expect(notice.message).toEqual({ key: 'legacyIdReinstall' });
    expect(notice.commands).toEqual([
      `herdr --session work plugin uninstall ${LEGACY}`,
      `herdr --session work plugin install ${REPO} --ref plugin --yes`,
      'herdr --session work plugin enable agentico',
    ]);
    expect(notice.notes).toHaveLength(3);
    expect(notice.reenableNotifications).toBe(true);
  });

  it('only turns a linked disabled current id on after the legacy id goes', () => {
    const notice = noticeOf(
      installed({ pluginId: LEGACY, version: '0.3.0', disabledCurrentIdSource: 'local' }),
    );
    expect(notice.message).toEqual({ key: 'legacyIdEnable' });
    expect(notice.commands).toEqual([
      `herdr plugin uninstall ${LEGACY}`,
      'herdr plugin enable agentico',
    ]);
  });

  it('removes a leftover legacy id and folds an update in', () => {
    const current = noticeOf(installed({ version: '0.6.0', leftoverLegacyIds: [LEGACY] }));
    expect(current.message).toEqual({ key: 'leftoverRemove' });
    expect(current.commands).toEqual([`herdr plugin uninstall ${LEGACY}`]);
    const outdated = noticeOf(installed({ version: '0.5.0', leftoverLegacyIds: [LEGACY] }));
    expect(outdated.message).toEqual({ key: 'leftoverUpdate' });
    expect(outdated.commands).toEqual([`herdr plugin uninstall ${LEGACY}`, INSTALL]);
  });

  it('updates a disabled outdated plugin, then turns it on', () => {
    const presentation = present(installed({ version: '0.5.0', isEnabled: false }));
    expect(presentation.value).toEqual({
      kind: 'installed',
      version: '0.5.0',
      linkedLocally: false,
      disabled: true,
    });
    expect(presentation.notice?.message).toEqual({
      key: 'disabledOutdated',
      installed: pluginVersion(0, 5, 0),
      bundled: v060,
    });
    expect(presentation.notice?.commands).toEqual([INSTALL, 'herdr plugin enable agentico']);
    expect(presentation.notice?.notes).toHaveLength(1);
  });

  it('only turns on a disabled linked plugin, even when outdated', () => {
    const notice = noticeOf(installed({ version: '0.5.0', isEnabled: false, source: 'local' }), {
      session: 'work',
    });
    expect(notice.commands).toEqual(['herdr --session work plugin enable agentico']);
  });

  it('turns on a disabled current plugin instead of reinstalling it', () => {
    const notice = noticeOf(installed({ version: '0.6.0', isEnabled: false }));
    expect(notice.message).toEqual({ key: 'disabled' });
    expect(notice.commands).toEqual(['herdr plugin enable agentico']);
  });

  it("names the Host's session in every command", () => {
    expect(
      noticeOf(installed({ version: '0.5.0', isEnabled: false }), { session: 'work' }).commands,
    ).toEqual([
      `herdr --session work plugin install ${REPO} --ref plugin --yes`,
      'herdr --session work plugin enable agentico',
    ]);
    expect(noticeOf({ kind: 'notInstalled' }, { session: 'work' }).commands).toEqual([
      `herdr --session work plugin install ${REPO} --ref plugin --yes`,
    ]);
  });

  it('asks for a reinstall after a stale manifest unless linked, without an action', () => {
    const github = noticeOf(installed({ version: '0.6.0', hasManifestWarning: true }));
    expect(github.message).toEqual({ key: 'manifestWarning' });
    expect(github.commands).toEqual([INSTALL]);
    expect(github.action).toBeNull();
    const linked = noticeOf(
      installed({ version: '0.6.0', source: 'local', hasManifestWarning: true }),
    );
    expect(linked.message).toEqual({ key: 'manifestWarningLinked' });
    expect(linked.commands).toEqual([]);
  });

  it('offers to install calmly when the plugin is missing', () => {
    expect(present({ kind: 'notInstalled' })).toEqual({
      value: { kind: 'notInstalled' },
      notice: {
        tone: 'info',
        message: { key: 'install' },
        commands: [INSTALL],
        notes: [],
        reenableNotifications: false,
        action: { title: 'install', steps: [{ kind: 'install' }] },
      },
    });
  });

  it("keeps the endpoint's instance in every recovery command", () => {
    const endpoint = makeHerdrEndpoint(
      '/tmp/custom herdr/herdr/sessions/work/herdr.sock',
      '/tmp/custom herdr/bin/launch',
    );
    const prefix = `/bin/sh -c 'export HERDR_SOCKET_PATH="$1"; shift; exec "$@"' herdr '/tmp/custom herdr/herdr/sessions/work/herdr.sock' '/tmp/custom herdr/bin/launch' `;
    const notice = noticeOf(
      installed({ pluginId: LEGACY, version: '0.3.0', disabledCurrentIdSource: 'github' }),
      {
        session: 'wrong',
        endpoint,
      },
    );
    expect(notice.commands).toEqual([
      `${prefix}plugin uninstall ${LEGACY}`,
      `${prefix}plugin install '${REPO}' --ref plugin --yes`,
      `${prefix}plugin enable agentico`,
    ]);
    expect(noticeOf({ kind: 'notInstalled' }, { endpoint }).commands).toEqual([notice.commands[1]]);
  });

  it('names what Claude Code Accounts need against a newer bundled plugin', () => {
    const notice = noticeOf(installed({ version: '0.7.1' }), { bundled: pluginVersion(0, 8, 0) });
    expect(notice.message).toMatchObject({
      installed: pluginVersion(0, 7, 1),
      bundled: pluginVersion(0, 8, 0),
    });
    expect(noteFeatures(notice)).toEqual(['claudeAccounts']);
  });
});

describe('plugin notice actions', () => {
  const action = (fields: Partial<PluginInstallation> & { version: string }) =>
    present(installed(fields), { session: 'work' }).notice?.action ?? null;
  const uninstall: PluginStep = { kind: 'uninstall', pluginId: LEGACY };
  const enable: PluginStep = { kind: 'enable', pluginId: 'agentico' };

  it.each<[Partial<PluginInstallation> & { version: string }, string, PluginStep[]]>([
    [{ version: '0.5.0' }, 'update', [{ kind: 'install' }]],
    [{ version: '0.5.0', isEnabled: false }, 'updateAndTurnOn', [{ kind: 'install' }, enable]],
    [{ version: '0.6.0', isEnabled: false }, 'turnOn', [enable]],
    // A linked plugin is still turned on, just never reinstalled.
    [{ version: '0.5.0', isEnabled: false, source: 'local' }, 'turnOn', [enable]],
    // The update runs before the removal, so a failed one changes nothing.
    [{ version: '0.5.0', leftoverLegacyIds: [LEGACY] }, 'update', [{ kind: 'install' }, uninstall]],
    [
      { version: '0.6.0', source: 'local', leftoverLegacyIds: [LEGACY] },
      'removeOldCopy',
      [uninstall],
    ],
  ])('%j runs %s', (fields, title, steps) => {
    expect(action(fields)).toEqual({ title, steps });
  });

  it.each<Partial<PluginInstallation> & { version: string }>([
    { version: '0.6.0', hasManifestWarning: true },
    { version: '0.5.0', isEnabled: false, hasManifestWarning: true },
    { version: '0.5.0', hasManifestWarning: true, leftoverLegacyIds: [LEGACY] },
    { version: '0.5.0', source: 'local' },
    { version: '0.5.0', source: 'unknown' },
    { version: '0.6.0', source: 'local', hasManifestWarning: true },
    { pluginId: LEGACY, version: '0.3.0' },
    { pluginId: LEGACY, version: '0.3.0', disabledCurrentIdSource: 'github' },
  ])('leaves %j to the user on the Host', (fields) => {
    expect(present(installed(fields)).notice).not.toBeNull();
    expect(action(fields)).toBeNull();
  });

  it("replaces only this repository's install", () => {
    expect(action({ version: '0.5.0', repository: 'someone/Agentico' })).toBeNull();
    expect(action({ version: '0.5.0', repository: 'Example/Agentico' })?.steps).toEqual([
      { kind: 'install' },
    ]);
    expect(action({ version: '0.5.0', repository: null })).toBeNull();
    // Turning a fork's plugin on replaces nothing; updating it first would.
    expect(
      action({ version: '0.6.0', isEnabled: false, repository: 'someone/Agentico' })?.steps,
    ).toEqual([enable]);
    expect(
      action({ version: '0.5.0', isEnabled: false, repository: 'someone/Agentico' }),
    ).toBeNull();
  });
});
