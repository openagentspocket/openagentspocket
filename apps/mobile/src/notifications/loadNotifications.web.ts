import type { NotificationsModule } from './loadNotifications';

/** The web has no push notifications (its module throws on every call): callers do nothing. */
export function loadNotifications(): NotificationsModule | null {
  return null;
}
