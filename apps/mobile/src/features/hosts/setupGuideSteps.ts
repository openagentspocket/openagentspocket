import { installerCommand } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';

export interface GuideStep {
  title: string;
  detail: string;
  /** Commands shown in copyable blocks. */
  commands?: readonly string[];
  /** A link line under the sentence (its target opens in the browser). */
  link?: { label: string; url: string };
}

export const HERDR_INSTALL_URL = 'https://herdr.dev/docs/install/';

/**
 * The commands a computer runs to show its Pairing Code: the one place the list is defined, so the
 * screens, the Setup Guide and "What happens" never list commands of their own. The installer
 * script (`packages/plugin/install`) does the whole job. Hosts run macOS or Linux.
 */
export function pairCommandLines(): readonly string[] {
  return [installerCommand('unix')];
}

/** How a computer shows its Pairing Code QR: the Setup Guide step, reused by Easy Pair. */
export function pairingCodeStep(): GuideStep {
  return {
    title: t('Show a Pairing Code'),
    detail: t(
      'Run this in a terminal on the computer, not on this phone. It checks the setup, installs the plugin and shows a QR code in herdr.',
    ),
    commands: pairCommandLines(),
  };
}

/**
 * The numbered steps of the guide, complete for someone who has never used herdr: where each
 * command runs, that herdr stays open to show the code, and how the phone reaches the computer.
 */
export function guideSteps(): readonly GuideStep[] {
  return [
    {
      title: t('Install herdr'),
      detail: t(
        'On the Mac or Linux computer your Agents run on: herdr 0.7.5 or newer, with Node 20 or newer.',
      ),
      link: { label: t('herdr Install Guide'), url: HERDR_INSTALL_URL },
    },
    {
      title: t('Turn on SSH'),
      detail: t(
        'On a Mac, turn on Remote Login in System Settings › General › Sharing. On Linux, run the OpenSSH server.',
      ),
    },
    {
      title: t('Open herdr'),
      detail: t(
        'Start herdr in a terminal on the computer and leave it open: the Pairing Code shows inside herdr.',
      ),
    },
    pairingCodeStep(),
    {
      title: t('Scan It'),
      detail: t('In Hosts, tap Scan to Pair and point the camera at the code.'),
    },
    {
      title: t('Reach It Away from Home'),
      detail: t(
        'At home, the phone and the computer only need the same Wi-Fi. Away from home, put both on one private network, such as Tailscale: install it on the computer and on this phone and sign in to the same account, before you show the Pairing Code.',
      ),
    },
  ];
}
