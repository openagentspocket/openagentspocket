import {
  formatPluginVersion,
  type PluginActionTitle,
  type PluginNoticeMessage,
  type PluginRequirement,
  type PluginValue,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';

/** The plugin row's value, as the Swift Host page words it. */
export function pluginValueText(value: PluginValue): string {
  switch (value.kind) {
    case 'checking':
      return t('Checking…');
    case 'unsupportedPlatform':
      return t('Not supported on Windows');
    case 'unknown':
      return t('Unknown');
    case 'notInstalled':
      return t('Not installed');
    case 'installed':
      return value.version ?? t('Unknown version');
  }
}

/** The notice's sentence. */
export function pluginMessageText(message: PluginNoticeMessage): string {
  switch (message.key) {
    case 'install':
      return t(
        "Install the Agentico plugin for notifications, Live Activity updates, and herdr's sidebar fields.",
      );
    case 'legacyIdReinstall':
      return t(
        'This Host runs an old Agentico plugin under its former name, and the current plugin is disabled. Remove the old copy, then install the current plugin and turn it on.',
      );
    case 'legacyIdEnable':
      return t(
        'This Host runs an old Agentico plugin under its former name, and the current plugin is disabled. Remove the old copy, then turn the current plugin on.',
      );
    case 'legacyId':
      return t(
        'This Host runs an old Agentico plugin under its former name. Remove it, then install the current plugin.',
      );
    case 'leftoverUpdate':
      return t(
        'An old copy of the Agentico plugin is still installed under its former name and may send duplicate notifications. Remove it and update the plugin:',
      );
    case 'leftoverRemove':
      return t(
        'An old copy of the Agentico plugin is still installed under its former name and may send duplicate notifications. Remove it:',
      );
    case 'disabledOutdated':
      return t(
        'The Agentico plugin is disabled and out of date: %@ → %@. Update it, then turn it on:',
        formatPluginVersion(message.installed),
        formatPluginVersion(message.bundled),
      );
    case 'disabled':
      return t(
        'The Agentico plugin is disabled, so this Host sends no notifications or Live Activity updates.',
      );
    case 'manifestWarningLinked':
      return t(
        "herdr could not read the plugin's manifest, so its version may be out of date. Check the linked checkout.",
      );
    case 'manifestWarning':
      return t(
        "herdr could not read the plugin's manifest, so its version may be out of date. Reinstall it.",
      );
    case 'updateLinked': {
      const bundled = formatPluginVersion(message.bundled);
      return t(
        'Plugin %@ is available. This plugin is linked from a local checkout; update that checkout to %@ or newer.',
        bundled,
        bundled,
      );
    }
    case 'updateAvailable':
      return t(
        'Update available: %@ → %@. Run this on the Host:',
        formatPluginVersion(message.installed),
        formatPluginVersion(message.bundled),
      );
  }
}

/** One footnote line: what the installed plugin lacks. */
export function pluginNoteText({ feature, minimum, installed }: PluginRequirement): string {
  const need = formatPluginVersion(minimum);
  const have = formatPluginVersion(installed);
  switch (feature) {
    case 'usage':
      return t('Usage needs plugin %@ or newer; this Host has %@.', need, have);
    case 'claudeAccounts':
      return t('Claude Code Accounts need plugin %@ or newer; this Host has %@.', need, have);
    case 'approvalActions':
      return t(
        'Approving from notifications needs plugin %@ or newer; this Host has %@.',
        need,
        have,
      );
    case 'liveActivityApprovals':
      return t(
        'Approve and Deny on the Live Activity need plugin %@ or newer; this Host has %@.',
        need,
        have,
      );
    case 'sidebarFields':
      return t(
        "Sync from plugin and herdr's sidebar fields need plugin %@ or newer; this Host has %@.",
        need,
        have,
      );
    case 'liveActivityUpdates':
      return t(
        'Live Activity updates while Agentico is in the background may need plugin %@ or newer; this Host has %@.',
        need,
        have,
      );
    case 'liveActivityRows':
      return t(
        'Background Live Activity updates may not follow your Agent List Fields before plugin %@; this Host has %@.',
        need,
        have,
      );
    case 'sessionScopedNotifications':
      return t(
        'Notifications from your other herdr sessions on this Host may reach this device until the plugin is %@ or newer; this Host has %@.',
        need,
        have,
      );
    case 'androidPush':
      return t(
        'Approving from notifications needs plugin %@ or newer; this Host has %@.',
        need,
        have,
      );
  }
}

export function pluginActionTitle(title: PluginActionTitle): string {
  switch (title) {
    case 'install':
      return t('Install Plugin');
    case 'update':
      return t('Update Plugin');
    case 'updateAndTurnOn':
      return t('Update and Turn On');
    case 'turnOn':
      return t('Turn On Plugin');
    case 'removeOldCopy':
      return t('Remove Old Copy');
  }
}
