import { t } from '@openagentspocket/i18n';
import { AppScreen } from '@/navigation/AppScreen';
import { NotificationPrivacyContent } from './NotificationDisclosure';

/** The persistent privacy disclosure: the explainer's story, reachable any time. */
export function NotificationPrivacyScreen() {
  return (
    <AppScreen
      header={{ variant: 'native', title: t('How notifications stay private') }}
      testID="settings-notification-privacy"
    >
      <NotificationPrivacyContent />
    </AppScreen>
  );
}
