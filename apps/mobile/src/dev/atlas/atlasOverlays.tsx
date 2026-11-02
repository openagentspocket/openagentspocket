import type { AttachStatus } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { type ConfirmOptions, confirm } from '@openagentspocket/ui';
import { type ReactNode, useEffect, useState } from 'react';
import { AgentDetailScreen } from '@/agent-detail/AgentDetailScreen';
import { StatusOverlay } from '@/agent-detail/terminal/StatusOverlay';
import { NotificationExplainerSheet } from '@/notifications/NotificationDisclosure';
import { deviceStorage } from '@/settings/deviceStorage';

const noop = () => {};

/** The screen behind an alert, with the alert asked once on mount (never answered by the atlas). */
export function AlertOver({ options, children }: { options: ConfirmOptions; children: ReactNode }) {
  useEffect(() => {
    void confirm(options);
  }, [options]);
  return <>{children}</>;
}

/** agent-detail.close-confirm: Close Pane as a popover over the terminal (Swift anchors it to the composer's "..."). */
export const closePanePopover: ConfirmOptions = {
  title: t('Close %@?', '“Polish the Attach experience”'),
  message: t("Closes this pane. Anything running in it stops. The tab's other panes stay open."),
  confirmLabel: t('Close Pane'),
  cancelLabel: t('Cancel'),
  destructive: true,
  presentation: 'popover',
};

/** usage.account-remove-confirm: Swift anchors it to the Account row. */
export const removeAccountPopover: ConfirmOptions = {
  title: t('Remove %@?', 'claude-2'),
  message: t(
    'Its Token Usage and Usage Limits stop showing. The directory and its sign-in stay on %@.',
    'Studio Mac',
  ),
  confirmLabel: t('Remove Account'),
  cancelLabel: t('Cancel'),
  destructive: true,
  presentation: 'popover',
};

export const closeConfirmation: ConfirmOptions = {
  title: t('Close %@?', 'iOS App'),
  message: t("Closes this pane. Anything running in it stops. The tab's other panes stay open."),
  confirmLabel: t('Close Pane'),
  destructive: true,
};

/** The Agent's Terminal surface (header, canvas, toolbar) with its status card over the canvas. */
export function TerminalStatusAtlas({ status }: { status: AttachStatus }) {
  return (
    <>
      <AgentDetailScreen
        hostId="demo"
        paneId="p1"
        storage={deviceStorage}
        surface="terminal"
        onSwitch={noop}
        moreItems={[{ key: 'changes', title: t('Changes'), onPress: noop }]}
      />
      <StatusOverlay status={status} onRetry={noop} />
    </>
  );
}

/** The pre-permission explainer, open over Settings > Notifications. */
export function ExplainerOpen({ children }: { children: ReactNode }) {
  const [visible] = useState(true);
  return (
    <>
      {children}
      <NotificationExplainerSheet visible={visible} onClose={noop} onContinue={noop} />
    </>
  );
}
