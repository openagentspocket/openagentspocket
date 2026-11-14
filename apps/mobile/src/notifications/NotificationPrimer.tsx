import { t } from '@openagentspocket/i18n';
import { Banner, PermissionPrimer, type PrimerReason } from '@openagentspocket/ui';
import { useNotificationPrimer } from './useNotificationPrimer';

/** Why notifications are worth turning on, in the primer's order. */
export function notificationReasons(): PrimerReason[] {
  return [
    {
      icon: 'hand',
      title: t('Get to a request in one tap'),
      message: t(
        'The notification and the Live Activity take you straight to what the Agent asks. Approving from the notification is an option you turn on per Host.',
      ),
    },
    {
      icon: 'bell',
      title: t('Know when it is done'),
      message: t('A notice when an Agent is blocked or finishes its work.'),
    },
    {
      icon: 'lock',
      title: t('Only you can read them'),
      message: t(
        'They are encrypted on your Host. The service that delivers them cannot open them.',
      ),
    },
  ];
}

interface SheetProps {
  visible: boolean;
  onTurnOn: () => void;
  onNotNow: () => void;
}

/** shell.home-notifications-primer: the notification primer's sheet, before the system prompt. */
export function NotificationPrimerSheet({ visible, onTurnOn, onNotNow }: SheetProps) {
  return (
    <PermissionPrimer
      visible={visible}
      onClose={onNotNow}
      title={t('Know when an Agent needs you')}
      reasons={notificationReasons()}
      primary={{ label: t('Enable Notifications'), onPress: onTurnOn }}
      secondary={{ label: t('Not Now'), onPress: onNotNow }}
      finePrint={t('You can change this in Settings › Notifications.')}
      testID="notification-primer"
    />
  );
}

/**
 * Home's notification primer: the sheet after the first Host connects, and after Not Now the one
 * reminder banner the first time an Agent needs the user. `focused`: Home is the screen in front.
 */
export function NotificationPrimer({ focused }: { focused: boolean }) {
  const primer = useNotificationPrimer(focused);
  return (
    <>
      {primer.bannerVisible ? (
        <Banner
          look="row"
          tone="info"
          icon="bell"
          message={t('Turn on notifications to know when an Agent needs you.')}
          actionLabel={t('Turn On')}
          onAction={primer.turnOn}
          onDismiss={primer.dismissBanner}
          dismissLabel={t('Dismiss')}
          testID="notification-reminder"
        />
      ) : null}
      <NotificationPrimerSheet
        visible={primer.sheetVisible}
        onTurnOn={primer.turnOn}
        onNotNow={primer.notNow}
      />
    </>
  );
}
