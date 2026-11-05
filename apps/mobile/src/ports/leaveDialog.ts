import { t } from '@openagentspocket/i18n';
import { confirm } from '@openagentspocket/ui';

/** browser.leave-confirm: a link that goes outside the Host's server opens in Safari only if asked. */
export function askLeavePreview(linkHost: string, hostName: string): Promise<boolean> {
  return confirm({
    title: t('Leave the Preview?'),
    message: t('This link goes to %@, outside %@.', linkHost, hostName),
    confirmLabel: t('Open in Safari'),
  });
}
