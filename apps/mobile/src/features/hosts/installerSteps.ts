import { t } from '@openagentspocket/i18n';

export interface InstallerStep {
  title: string;
  detail: string;
}

/**
 * What the installer does, in the order `packages/plugin/install` does it: the "What happens"
 * sheet lists exactly this. Change the script and this list together.
 */
export function installerSteps(): readonly InstallerStep[] {
  return [
    {
      title: t('It checks the machine'),
      detail: t(
        'herdr, Node.js 20 or newer and the SSH server. If something is missing it tells you the exact next step and stops; it never installs system software on its own.',
      ),
    },
    {
      title: t('It installs or updates the plugin'),
      detail: t("With herdr's own plugin commands, at the version the script ships with."),
    },
    {
      title: t('It shows a one-time Pairing Code'),
      detail: t('A QR code in a herdr popup. It works once and expires in two minutes.'),
    },
    {
      title: t('The app connects'),
      detail: t(
        "When you scan it, the app connects with the code's single-use bootstrap key and enrolls this device's key.",
      ),
    },
    {
      title: t('Nothing else changes'),
      detail: t('No other settings, files or services are touched.'),
    },
  ];
}
