import { Screen } from '@openagentspocket/ui';
import { NotificationPrivacyContent } from './NotificationDisclosure';

/** The persistent privacy disclosure: the explainer's story, reachable any time. */
export function NotificationPrivacyScreen() {
  return (
    <Screen testID="settings-notification-privacy">
      <NotificationPrivacyContent />
    </Screen>
  );
}
