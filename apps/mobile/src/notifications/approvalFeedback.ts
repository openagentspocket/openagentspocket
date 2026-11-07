import type { ApprovalOutcome } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';

/** What the user is told when an Approve or Deny ends; null when there is nothing to say. */
export function approvalFeedback(outcome: ApprovalOutcome, host: string): string | null {
  switch (outcome) {
    case 'answered':
    case 'ignored':
      return null;
    case 'expired':
      return t('Too old to answer from here. Open the Agent.');
    case 'optedOut':
      return t('Approving from notifications is off for %@. Nothing was sent.', host);
    case 'notAnswerable':
    case 'promptChanged':
      return t("That prompt changed, or can't be answered here. Nothing was sent.");
    case 'promptCut':
      return t('The prompt was cut short, so approve it in the app. Nothing was sent.');
    case 'denyOnly':
      return t('Approve this kind of request in the app. Nothing was sent.');
    case 'pluginOutdated':
      return t(
        'Update the Agentico plugin on %@ to answer from notifications. Nothing was sent.',
        host,
      );
    case 'unreachable':
      return t("Couldn't reach %@. Nothing was sent.", host);
    case 'sendFailed':
      return t("Sent, but the Agent didn't react. Check it.");
    case 'timedOut':
      return t('The Host took too long. Nothing was sent.');
    case 'notAuthenticated':
      return t('Approving needs your Face ID or passcode. Nothing was sent.');
  }
}
