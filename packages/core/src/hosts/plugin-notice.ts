import { renderHerdrCommand } from './herdr-command-line';
import type { HerdrEndpoint } from './herdr-endpoint';
import {
  AGENTICO_PLUGIN_ID,
  isLegacyPluginId,
  isReplaceableByInstall,
  PLUGIN_REPOSITORY,
  type PluginInstallation,
  type PluginStatus,
  type PluginStep,
  pluginInstallArguments,
} from './plugin-installation';
import {
  BUNDLED_PLUGIN_VERSION,
  comparePluginVersions,
  PLUGIN_FEATURE_MINIMUM,
  PLUGIN_FEATURES,
  type PluginRequirement,
  type PluginVersion,
  parsePluginVersion,
  pluginRequirements,
} from './plugin-version';

/** The plugin row's value; the UI words it. */
export type PluginValue =
  | { readonly kind: 'checking' | 'unsupportedPlatform' | 'unknown' | 'notInstalled' }
  | {
      readonly kind: 'installed';
      /** null when herdr reported no version. */
      readonly version: string | null;
      readonly linkedLocally: boolean;
      readonly disabled: boolean;
    };

/** The notice's sentence, as an i18n key plus versions where it names them. */
export type PluginNoticeMessage =
  | { readonly key: 'install' }
  | { readonly key: 'legacyIdReinstall' }
  | { readonly key: 'legacyIdEnable' }
  | { readonly key: 'legacyId' }
  | { readonly key: 'leftoverUpdate' }
  | { readonly key: 'leftoverRemove' }
  | {
      readonly key: 'disabledOutdated';
      readonly installed: PluginVersion;
      readonly bundled: PluginVersion;
    }
  | { readonly key: 'disabled' }
  | { readonly key: 'manifestWarningLinked' }
  | { readonly key: 'manifestWarning' }
  | { readonly key: 'updateLinked'; readonly bundled: PluginVersion }
  | {
      readonly key: 'updateAvailable';
      readonly installed: PluginVersion;
      readonly bundled: PluginVersion;
    };

export type PluginActionTitle =
  | 'install'
  | 'update'
  | 'updateAndTurnOn'
  | 'turnOn'
  | 'removeOldCopy';

/** The notice's commands as steps the app can run for the user. */
export interface PluginNoticeAction {
  readonly title: PluginActionTitle;
  readonly steps: readonly PluginStep[];
}

export interface PluginNotice {
  readonly tone: 'warning' | 'info';
  readonly message: PluginNoticeMessage;
  /** Shell commands to run on the Host, in order. */
  readonly commands: readonly string[];
  /** Features the current plugin lacks. */
  readonly notes: readonly PluginRequirement[];
  /** The new plugin keeps its own registrations: turn Notifications back on afterwards. */
  readonly reenableNotifications: boolean;
  /**
   * null when the user has to act on the Host: an install over a plugin that
   * is not a GitHub install of this repository, or a change of plugin id.
   */
  readonly action: PluginNoticeAction | null;
}

export interface PluginPresentation {
  readonly value: PluginValue;
  readonly notice: PluginNotice | null;
}

export interface PluginContext {
  /** The Host's herdr session name, blank for the default session. */
  readonly session: string;
  readonly endpoint?: HerdrEndpoint | null;
  readonly bundled?: PluginVersion;
  readonly repository?: string;
}

interface Resolved {
  readonly bundled: PluginVersion;
  readonly repository: string;
  readonly install: string;
  command(args: readonly string[]): string;
}

function resolve(context: PluginContext): Resolved {
  const repository = context.repository ?? PLUGIN_REPOSITORY;
  const endpoint = context.endpoint ?? null;
  const command = (args: readonly string[]) => renderHerdrCommand(context.session, endpoint, args);
  // As the Setup Guide shows it: a repository's `/` reads alike in every shell.
  const install = endpoint
    ? command(pluginInstallArguments(repository))
    : [command([]), ...pluginInstallArguments(repository)].join(' ');
  return { bundled: context.bundled ?? BUNDLED_PLUGIN_VERSION, repository, install, command };
}

const notice = (
  fields: Pick<PluginNotice, 'message' | 'commands'> & Partial<PluginNotice>,
): PluginNotice => ({
  tone: 'warning',
  notes: [],
  reenableNotifications: false,
  action: null,
  ...fields,
});

/** Host detail's plugin row and, when the user has something to do, its notice. */
export function pluginPresentation(
  status: PluginStatus,
  context: PluginContext,
): PluginPresentation {
  switch (status.kind) {
    case 'checking':
    case 'unsupportedPlatform':
      return { value: { kind: status.kind }, notice: null };
    case 'unavailable':
      return { value: { kind: 'unknown' }, notice: null };
    case 'notInstalled':
      return {
        value: { kind: 'notInstalled' },
        notice: notice({
          tone: 'info',
          message: { key: 'install' },
          commands: [resolve(context).install],
          action: { title: 'install', steps: [{ kind: 'install' }] },
        }),
      };
    case 'installed':
      return describe(status.installation, resolve(context));
  }
}

function describe(installation: PluginInstallation, ctx: Resolved): PluginPresentation {
  const version = installation.version === '' ? null : installation.version;
  const parsed = parsePluginVersion(installation.version);
  const isOutdated = parsed !== null && comparePluginVersions(parsed, ctx.bundled) < 0;
  const isLocal = installation.source === 'local';
  const shown: PluginValue = {
    kind: 'installed',
    version,
    linkedLocally: isLocal,
    disabled: false,
  };
  const plain: PluginValue = { ...shown, linkedLocally: false };
  const missing = parsed
    ? pluginRequirements(
        PLUGIN_FEATURES.filter(
          (f) => comparePluginVersions(PLUGIN_FEATURE_MINIMUM[f], ctx.bundled) <= 0,
        ),
        parsed,
      )
    : [];
  const { pluginId } = installation;
  const uninstall = (id: string) => ctx.command(['plugin', 'uninstall', id]);
  const enable = (id: string) => ctx.command(['plugin', 'enable', id]);
  const action = (title: PluginActionTitle, steps: PluginStep[]): PluginNoticeAction | null => {
    const installs = steps.some((step) => step.kind === 'install');
    return installs && !isReplaceableByInstall(installation, ctx.repository)
      ? null
      : { title, steps };
  };

  if (isLegacyPluginId(installation)) {
    // Installing next to the old id would run both plugins' hooks.
    const currentSource = installation.disabledCurrentIdSource;
    if (currentSource !== null) {
      // herdr refuses to reinstall over a linked current plugin.
      const reinstalls = currentSource !== 'local';
      const commands = [uninstall(pluginId)];
      if (reinstalls) commands.push(ctx.install);
      commands.push(enable(AGENTICO_PLUGIN_ID));
      const key = reinstalls ? 'legacyIdReinstall' : 'legacyIdEnable';
      return {
        value: plain,
        notice: notice({ message: { key }, commands, notes: missing, reenableNotifications: true }),
      };
    }
    return {
      value: plain,
      notice: notice({
        message: { key: 'legacyId' },
        commands: [uninstall(pluginId), ctx.install],
        notes: missing,
        reenableNotifications: true,
      }),
    };
  }
  if (installation.leftoverLegacyIds.length > 0) {
    const updates = isOutdated && !isLocal;
    // The action updates first, so a failed update leaves the Host as it was.
    const steps: PluginStep[] = updates ? [{ kind: 'install' }] : [];
    steps.push(
      ...installation.leftoverLegacyIds.map((id) => ({ kind: 'uninstall' as const, pluginId: id })),
    );
    return {
      value: shown,
      notice: notice({
        message: { key: updates ? 'leftoverUpdate' : 'leftoverRemove' },
        commands: [
          ...installation.leftoverLegacyIds.map(uninstall),
          ...(updates ? [ctx.install] : []),
        ],
        notes: missing,
        action: action(updates ? 'update' : 'removeOldCopy', steps),
      }),
    };
  }
  if (!installation.isEnabled) {
    const disabled: PluginValue = { ...plain, disabled: true };
    // A reinstall keeps a disabled plugin disabled on recent herdr, so the
    // update is followed by enable, which also succeeds on an enabled plugin.
    if (isOutdated && !isLocal && parsed) {
      return {
        value: disabled,
        notice: notice({
          message: { key: 'disabledOutdated', installed: parsed, bundled: ctx.bundled },
          commands: [ctx.install, enable(pluginId)],
          notes: missing,
          action: action('updateAndTurnOn', [{ kind: 'install' }, { kind: 'enable', pluginId }]),
        }),
      };
    }
    return {
      value: disabled,
      notice: notice({
        message: { key: 'disabled' },
        commands: [enable(pluginId)],
        action: action('turnOn', [{ kind: 'enable', pluginId }]),
      }),
    };
  }
  if (installation.hasManifestWarning) {
    // No action: the registry's version may be stale, so a reinstall could be
    // a downgrade the app cannot see.
    return {
      value: shown,
      notice: notice({
        message: { key: isLocal ? 'manifestWarningLinked' : 'manifestWarning' },
        commands: isLocal ? [] : [ctx.install],
      }),
    };
  }
  if (!isOutdated || !parsed) return { value: shown, notice: null };
  if (isLocal) {
    // `herdr plugin install` refuses to replace a linked plugin.
    return {
      value: shown,
      notice: notice({
        message: { key: 'updateLinked', bundled: ctx.bundled },
        commands: [],
        notes: missing,
      }),
    };
  }
  return {
    value: shown,
    notice: notice({
      message: { key: 'updateAvailable', installed: parsed, bundled: ctx.bundled },
      commands: [ctx.install],
      notes: missing,
      action: action('update', [{ kind: 'install' }]),
    }),
  };
}
