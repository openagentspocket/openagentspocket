import { AppScreen } from '@/navigation/AppScreen';
import { NotificationPrivacyContent } from './NotificationDisclosure';

/** The persistent privacy disclosure: the explainer's story, reachable any time. */
export function NotificationPrivacyScreen() {
  return (
    <AppScreen header={{ variant: 'native' }} testID="settings-notification-privacy">
      <NotificationPrivacyContent />
    </AppScreen>
  );
}
