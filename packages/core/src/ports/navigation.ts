/**
 * What the preview's web view does with one navigation: pages of the tunnel stay in it, links to
 * the Host's own port are pointed at the tunnel, and anything else leaves the preview only if
 * the user agrees. URLs are plain strings (core has no DOM `URL`).
 */
export type PortPreviewNavigation =
  | { readonly kind: 'allow' }
  /** Load this URL instead: the same page through the tunnel. */
  | { readonly kind: 'redirect'; readonly url: string }
  /** A page outside the Host's server; ask before opening it in the system browser. */
  | { readonly kind: 'external'; readonly url: string }
  | { readonly kind: 'cancel' };

interface ParsedUrl {
  scheme: string;
  /** Lowercased, IPv6 brackets stripped; null without an authority (`about:blank`). */
  host: string | null;
  port: number | null;
  /** Path, query and fragment, as written. */
  rest: string;
}

const URL_PATTERN =
  /^([a-zA-Z][a-zA-Z0-9+.-]*):(?:\/\/(?:[^@/?#]*@)?(\[[^\]]*\]|[^:/?#]*)(?::([0-9]*))?)?(.*)$/s;

export function parseUrl(text: string): ParsedUrl | null {
  const match = URL_PATTERN.exec(text);
  if (!match) return null;
  const [, scheme = '', rawHost, rawPort, rest = ''] = match;
  const host = rawHost === undefined ? null : rawHost.replace(/^\[|\]$/g, '').toLowerCase();
  const port = rawPort ? Math.min(Number(rawPort), 65535) : null;
  return { scheme: scheme.toLowerCase(), host, port, rest };
}

function isLoopbackName(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/** `url` with the tunnel's origin (`http://127.0.0.1:<localPort>`), keeping path, query, fragment. */
export function tunnelUrl(url: string, localPort: number): string | null {
  const parsed = parseUrl(url);
  if (!parsed) return null;
  return `http://127.0.0.1:${localPort}${parsed.rest}`;
}

/**
 * What Share hands on: the page as the Host itself serves it (`http://localhost:<remotePort>/…`),
 * never the phone's loopback URL, which means nothing outside the preview.
 */
export function hostUrl(url: string | null, remotePort: number): string {
  const parsed = url === null ? null : parseUrl(url);
  const rest = parsed?.rest ?? '';
  return `http://localhost:${remotePort}${rest === '' ? '/' : rest}`;
}

export function decideNavigation(
  url: string,
  options: { isMainFrame: boolean; localPort: number; remotePort: number },
): PortPreviewNavigation {
  const parsed = parseUrl(url);
  if (!parsed) return { kind: 'cancel' };
  const { scheme, host, port } = parsed;
  switch (scheme) {
    case 'about':
    case 'blob':
    case 'data':
      return { kind: 'allow' };
    case 'http':
    case 'https':
    case 'ws':
    case 'wss':
      break;
    default:
      return { kind: 'cancel' };
  }
  // Subframes (an embedded map, a CDN widget) load as the page asks; only top-level navigation
  // is kept on the Host.
  if (!options.isMainFrame) return { kind: 'allow' };
  if (host === null || !isLoopbackName(host)) {
    return scheme === 'http' || scheme === 'https' ? { kind: 'external', url } : { kind: 'cancel' };
  }
  if (scheme === 'http' && port === options.localPort) return { kind: 'allow' };
  const namesRemote =
    port === options.remotePort ||
    (port === null && options.remotePort === 80 && scheme === 'http');
  if (namesRemote) {
    const rewritten = tunnelUrl(url, options.localPort);
    if (rewritten) return { kind: 'redirect', url: rewritten };
  }
  return { kind: 'cancel' };
}
