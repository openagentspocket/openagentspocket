export type NotificationsModule = typeof import('expo-notifications');

/**
 * expo-notifications where the device has it (iOS, Android), loaded lazily so Jest and the web
 * never evaluate it. The web build resolves `loadNotifications.web.ts` instead: no push there.
 */
export function loadNotifications(): NotificationsModule | null {
  return require('expo-notifications') as NotificationsModule;
}
