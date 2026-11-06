/** Where the Notification Service Extension leaves a push's link, once it has decrypted it. */
const LINK_KEY = 'agenticoLink';

const linkIn = (value: unknown): string | null => {
  if (typeof value !== 'object' || value === null) return null;
  const link = (value as Record<string, unknown>)[LINK_KEY];
  return typeof link === 'string' ? link : null;
};

/** The app link of a tapped notification; expo shows a push's fields in one place or the other. */
export function notificationTapLink(content: { data?: unknown; payload?: unknown }): string | null {
  return linkIn(content.data) ?? linkIn(content.payload);
}
