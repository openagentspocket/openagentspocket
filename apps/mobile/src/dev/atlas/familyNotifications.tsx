// Atlas entries of the notifications family (in-app banner, pre-permission explainer, primer).
import Index from '@/app/index';
import NotificationsRoute from '@/app/settings/notifications';
import { NotificationPrimerSheet } from '@/notifications/NotificationPrimer';
import { noop } from './atlasHelpers';
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
  // Demo mode never shows the primer, so the atlas opens its sheet over Home directly.
  'shell.home-notifications-primer': {
    render: () => (
      <>
        <Index />
        <NotificationPrimerSheet visible onTurnOn={noop} onNotNow={noop} />
      </>
    ),
  },
};
