import { type ConsoleRow, userFacingDescription } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { type ActionMenuItem, confirm } from '@openagentspocket/ui';
import type { AgentActions } from './agentActions';

interface CloseOptions {
  /** Points the confirmation at a control (an anchored popover); without it the alert is centered. */
  anchorKey?: string;
}

/**
 * Asks, then closes the Agent's pane on its Host (Swift: Close Pane?). Resolves true once it closed;
 * a refused close says why and resolves false. The one close flow every surface shares.
 */
export async function closeAgent(
  row: ConsoleRow,
  actions: Pick<AgentActions, 'close'>,
  { anchorKey }: CloseOptions = {},
): Promise<boolean> {
  const name = row.agent.name ?? row.agent.agent ?? row.agent.pane_id;
  const ok = await confirm({
    title: t('Close %@?', name),
    message: t("Closes this pane. Anything running in it stops. The tab's other panes stay open."),
    confirmLabel: t('Close Pane'),
    destructive: true,
    ...(anchorKey ? { presentation: 'popover' as const, anchorKey } : {}),
  });
  if (!ok) return false;
  try {
    await actions.close(row);
    return true;
  } catch (thrown) {
    await confirm({
      title: t("Couldn't Close Agent"),
      message: userFacingDescription(thrown),
      confirmLabel: t('OK'),
      cancelLabel: null,
    });
    return false;
  }
}

/** The "Close Agent" menu entry (destructive, trash glyph) over the shared close flow. */
export function closeAgentItem(
  row: ConsoleRow,
  actions: Pick<AgentActions, 'close'>,
  onClosed: () => void,
  options?: CloseOptions,
): ActionMenuItem {
  return {
    key: 'close',
    title: t('Close Agent'),
    icon: 'trash',
    destructive: true,
    onPress: () => void closeAgent(row, actions, options).then((closed) => closed && onClosed()),
  };
}
