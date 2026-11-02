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

/** The plugin is installed from the repository you publish it in; the command names it generically. */
export const PLUGIN_INSTALL_COMMAND = 'herdr plugin install <repository> --ref plugin --yes';
export const PAIR_COMMAND = 'herdr plugin action invoke agentico.pair';

/** The numbered steps of the guide, as the Swift Setup Guide lists them (reference-only variant). */
export function guideSteps(platform: SetupPlatform): readonly GuideStep[] {
  if (platform === 'windows') {
    return [
      {
        title: t('Set Up herdr on Windows'),
        detail: t('Native Windows needs herdr 0.9.3 or newer and OpenSSH Server.'),
        link: { label: t('Windows Setup Guide'), url: 'https://herdr.dev/docs/install/' },
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
      link: { label: t('herdr Install Guide'), url: 'https://herdr.dev/docs/install/' },
    },
    {
      title: t('Turn on SSH'),
      detail: t(
        'On a Mac, turn on Remote Login in System Settings › General › Sharing. On Linux, run the OpenSSH server.',
      ),
    },
    {
      title: t('Show a Pairing Code'),
      detail: t('Run these on the machine. The second command shows a QR code.'),
      commands: [PLUGIN_INSTALL_COMMAND, PAIR_COMMAND],
    },
    {
      title: t('Scan It'),
      detail: t('In Hosts, tap Scan to Pair and point the camera at the code.'),
    },
  ];
}
