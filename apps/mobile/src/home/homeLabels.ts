import { t } from '@openagentspocket/i18n';
import type { AgentRowLabels } from '@openagentspocket/ui';

/** The shared row labels (menu, swipes, host lines) in the current locale; call at render time. */
export function homeLabels(): AgentRowLabels {
  return {
    status: {
      blocked: t('Needs you'),
      working: t('Working'),
      done: t('Done'),
      idle: t('Idle'),
    },
    saved: t('Saved'),
    pin: t('Pin'),
    unpin: t('Unpin'),
    details: t('Details'),
    closePane: t('Close Pane'),
    close: t('Close'),
    newTerminal: t('New Terminal'),
    seeAll: t('See all'),
    hostOffline: (host) => t('%@ is offline', host),
    hostsOffline: (count) => t('%lld Hosts not connected', count),
    contextLow: (left) => left,
  };
}
