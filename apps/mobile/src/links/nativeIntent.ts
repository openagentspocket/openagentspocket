import type { AppLink } from './appLink';
import { isLinkHead, LINK_SCHEMES, parseAppLink } from './appLink';

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
    : isLinkHead(path.split(/[/?]/)[1] ?? '');
  if (!ours) return path;
  const link = parseAppLink(path);
  if (link) return routeForLink(link);
  return plainRoute(path) ?? '/';
}

/**
 * A link of ours that names an in-app screen (`openagentspocket:///hosts`, `agentico://settings`).
 * Android hands the whole URL over while the app is running, where iOS has already stripped the
 * scheme; without this such a link fell through to Home. Agent and usage links stay with
 * `parseAppLink`, so a malformed one still opens Home.
 */
function plainRoute(url: string): string | null {
  const shaped = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?/i.exec(url);
  if (!shaped) return null;
  const [, authority = '', path = '', query] = shaped;
  const route = authority === '' ? path : `/${authority}${path}`;
  const head = route.split('/')[1] ?? '';
  if (head === '' || isLinkHead(head)) return null;
  return query ? `${route}?${query}` : route;
}
