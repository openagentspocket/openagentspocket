import { t } from '@openagentspocket/i18n';
import { type AgentRowLabels, defaultAgentRowLabels } from '@openagentspocket/ui';

/** The Agent list row strings, resolved through the catalogs (the UI package only knows English). */
export function agentRowLabels(): AgentRowLabels {
  return {
    ...defaultAgentRowLabels,
    status: {
      blocked: t('Blocked'),
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
  };
}
