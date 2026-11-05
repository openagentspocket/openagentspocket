import { PLUGIN_REPOSITORY, pluginInstallArguments } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';

export type SetupPlatform = 'unix' | 'windows';

export interface GuideStep {
  title: string;
  detail: string;
  /** Commands shown in copyable blocks. */
  commands?: readonly string[];
  /** A link line under the sentence (its target opens in the browser). */
  link?: { label: string; url: string };
}

/**
 * Where the guide's links and the plugin command point. All derive from `PLUGIN_REPOSITORY`
 * (core), the one place that names the project's GitHub repository.
 */
export const GUIDE_URL = `https://github.com/${PLUGIN_REPOSITORY}#installation`;
export const WINDOWS_GUIDE_URL = `https://github.com/${PLUGIN_REPOSITORY}/blob/main/docs/guides/windows-setup.md`;
export const HERDR_INSTALL_URL = 'https://herdr.dev/docs/install/';
export const PLUGIN_INSTALL_COMMAND = ['herdr', ...pluginInstallArguments()].join(' ');
export const PAIR_COMMAND = 'herdr plugin action invoke agentico.pair';

/** How a machine shows its Pairing Code QR: the Setup Guide step, reused by Scan to Pair. */
export function pairingCodeStep(): GuideStep {
  return {
    title: t('Show a Pairing Code'),
    detail: t('Run these on the machine. The second command shows a QR code.'),
    commands: [PLUGIN_INSTALL_COMMAND, PAIR_COMMAND],
  };
}

/** The numbered steps of the guide, as the Swift Setup Guide lists them (reference-only variant). */
export function guideSteps(platform: SetupPlatform): readonly GuideStep[] {
  if (platform === 'windows') {
    return [
      {
        title: t('Set Up herdr on Windows'),
        detail: t('Native Windows needs herdr 0.9.3 or newer and OpenSSH Server.'),
        link: { label: t('Windows Setup Guide'), url: WINDOWS_GUIDE_URL },
      },
      {
        title: t('Add the Host'),
        detail: t(
          'Windows Hosts are added by hand: in Hosts, tap Add Host and enter the address and login.',
        ),
      },
    ];
  }
  return [
    {
      title: t('Install herdr'),
      detail: t('Version 0.7.5 or newer, with Node 20 or newer.'),
      link: { label: t('herdr Install Guide'), url: HERDR_INSTALL_URL },
    },
    {
      title: t('Turn on SSH'),
      detail: t(
        'On a Mac, turn on Remote Login in System Settings › General › Sharing. On Linux, run the OpenSSH server.',
      ),
    },
    pairingCodeStep(),
    {
      title: t('Scan It'),
      detail: t('In Hosts, tap Scan to Pair and point the camera at the code.'),
    },
  ];
}
