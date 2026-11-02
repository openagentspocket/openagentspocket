import { t } from '@openagentspocket/i18n';
import type { ConfirmOptions } from '@openagentspocket/ui';

/** agent-detail.shell-close-confirm: the dialog before a shell Terminal's pane is closed. */
export const closeTerminalConfirmation = (): ConfirmOptions => ({
  title: t('Close Terminal?'),
  message: t(
    'This closes the pane on the Host, ending anything running in it. Going Back instead leaves it for desktop handoff.',
  ),
  confirmLabel: t('Close Terminal'),
  cancelLabel: t('Cancel'),
  destructive: true,
  presentation: 'popover',
});
