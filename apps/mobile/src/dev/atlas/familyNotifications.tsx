// Atlas entries of the notifications family (in-app banner, pre-permission explainer).
import NotificationsRoute from '@/app/settings/notifications';
import { ExplainerOpen } from './atlasOverlays';
import type { AtlasEntry } from './entries';
import { InAppBannerAtlas } from './InAppBannerAtlas';

export const notificationEntries: Readonly<Record<string, AtlasEntry>> = {
  'shell.notification-banner': { render: () => <InAppBannerAtlas /> },
  'settings.notification-explainer': {
    render: () => (
      <ExplainerOpen>
        <NotificationsRoute />
      </ExplainerOpen>
    ),
  },
};
