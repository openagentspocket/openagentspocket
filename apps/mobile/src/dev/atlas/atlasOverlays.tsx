import type { AttachStatus } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { type ConfirmOptions, confirm, Screen } from '@openagentspocket/ui';
import { type ReactNode, useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatusOverlay } from '@/agent-detail/terminal/StatusOverlay';
import { NotificationExplainerSheet } from '@/notifications/NotificationDisclosure';

const noop = () => {};

/** The screen behind an alert, with the alert asked once on mount (never answered by the atlas). */
export function AlertOver({ options, children }: { options: ConfirmOptions; children: ReactNode }) {
  useEffect(() => {
    void confirm(options);
  }, [options]);
  return <>{children}</>;
}

export const closeConfirmation: ConfirmOptions = {
  title: t('Close %@?', 'iOS App'),
  message: t("Closes this pane. Anything running in it stops. The tab's other panes stay open."),
  confirmLabel: t('Close Pane'),
  destructive: true,
};

export const removeHostConfirmation: ConfirmOptions = {
  title: t('Remove %@?', 'Demo Host'),
  message: `${t('This permanently deletes the Host configuration and any saved password from the Keychain.')} ${t('This cannot be undone.')}`,
  confirmLabel: t('Remove Host'),
  destructive: true,
};

/** The terminal canvas with its status card over it, in a fixed state. */
export function TerminalStatusAtlas({ status }: { status: AttachStatus }) {
  return (
    <Screen scroll={false} edges={['bottom']}>
      <View style={{ flex: 1 }}>
        <StatusOverlay status={status} onRetry={noop} />
      </View>
    </Screen>
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
