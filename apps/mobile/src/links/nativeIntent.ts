import type { AppLink } from './appLink';
import { LINK_SCHEMES, parseAppLink } from './appLink';

/** The in-app route an incoming link opens; null when the link is not one of ours. */
export function routeForLink(link: AppLink): string {
  if (link.kind === 'usage') return link.limits ? '/usage-limits' : '/usage';
  if (link.host.kind === 'id') {
    const host = encodeURIComponent(link.host.id);
    return link.paneId === null ? '/' : `/agent/${host}/${encodeURIComponent(link.paneId)}`;
  }
  const items = [`host=${encodeURIComponent(link.host.value)}`];
  if (link.host.session !== null) items.push(`session=${encodeURIComponent(link.host.session)}`);
  if (link.paneId !== null) items.push(`pane=${encodeURIComponent(link.paneId)}`);
  return `/agent?${items.join('&')}`;
}

/**
 * Expo Router's `redirectSystemPath`: turns a link opened from outside (either scheme) into a real
 * route. Links that are not ours pass through untouched; ours that are malformed open Home.
 */
export function redirectLink(path: string): string {
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(path)?.[1]?.toLowerCase();
  const ours = scheme
    ? (LINK_SCHEMES as readonly string[]).includes(scheme)
    : /^\/(agent|usage)(\/|\?|$)/.test(path);
  if (!ours) return path;
  const link = parseAppLink(path);
  return link ? routeForLink(link) : '/';
}
