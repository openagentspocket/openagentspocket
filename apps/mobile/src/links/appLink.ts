/** Schemes the app answers to: its own, and the legacy one the plugin and old widgets emit. */
export const LINK_SCHEMES = ['openagentspocket', 'agentico'] as const;

/** How a link names its Host. */
export type HostReference =
  | { readonly kind: 'id'; readonly id: string }
  /** A saved Host's address or name as another app knows it; `session` null is the default one. */
  | { readonly kind: 'lookup'; readonly value: string; readonly session: string | null };

/** A Live Activity button's link: it opens a confirmation of that prompt, and answers nothing. */
export interface LinkAnswer {
  readonly decision: 'approve' | 'deny';
  readonly episodeId: string;
}

export type AppLink =
  | {
      readonly kind: 'agent';
      readonly host: HostReference;
      /** null opens the Console. */
      readonly paneId: string | null;
      /** A Live Activity button's prompt; it only selects, the app reads it from the Host. */
      readonly answer?: LinkAnswer;
    }
  | { readonly kind: 'usage'; readonly hostId: string | null; readonly limits: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** herdr lists its default session under this name, so a named session never has it. */
const DEFAULT_SESSION_NAME = 'default';
const URL_SHAPE = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?/i;

function decode(part: string): string | null {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}

/** The query items by name; null when one repeats (it would name two things) or is malformed. */
function queryItems(query: string | undefined): Map<string, string> | null {
  const items = new Map<string, string>();
  for (const pair of query ? query.split('&') : []) {
    if (pair === '') continue;
    const eq = pair.indexOf('=');
    const name = decode(eq < 0 ? pair : pair.slice(0, eq));
    const value = decode(eq < 0 ? '' : pair.slice(eq + 1));
    if (name === null || value === null) return null;
    if (items.has(name)) return null;
    items.set(name, value);
  }
  return items;
}

function splitPath(path: string): string[] | null {
  const segments: string[] = [];
  for (const raw of path.split('/')) {
    if (raw === '') continue;
    const segment = decode(raw);
    if (segment === null) return null;
    segments.push(segment);
  }
  return segments;
}

function agentLink(segments: string[], query: Map<string, string>): AppLink | null {
  if (segments.length === 0) {
    const host = query.get('host');
    if (!host) return null;
    const session = query.get('session');
    const pane = query.get('pane');
    return {
      kind: 'agent',
      host: {
        kind: 'lookup',
        value: host,
        session: !session || session === DEFAULT_SESSION_NAME ? null : session,
      },
      paneId: pane ? pane : null,
    };
  }
  const [id, pane, ...rest] = segments;
  if (!id || !UUID.test(id) || rest.length > 0) return null;
  const answer = pane ? linkAnswer(query) : null;
  return {
    kind: 'agent',
    host: { kind: 'id', id },
    paneId: pane ?? null,
    ...(answer && { answer }),
  };
}

function linkAnswer(query: Map<string, string>): LinkAnswer | null {
  const decision = query.get('answer');
  const episodeId = query.get('bid');
  if ((decision !== 'approve' && decision !== 'deny') || !episodeId) return null;
  return { decision, episodeId };
}

function usageLink(segments: string[], query: Map<string, string>): AppLink | null {
  const host = query.get('host');
  const hostId = host !== undefined && UUID.test(host) ? host : null;
  if (segments.length === 0) return { kind: 'usage', hostId, limits: false };
  if (segments.length === 1 && segments[0] === 'limits') {
    return hostId ? { kind: 'usage', hostId, limits: true } : null;
  }
  return null;
}

/** Every link kind by its first word; a new kind is one more entry, and every reader follows. */
const LINK_PARSERS: ReadonlyMap<
  string,
  (segments: string[], query: Map<string, string>) => AppLink | null
> = new Map([
  ['agent', agentLink],
  ['usage', usageLink],
]);

/** Whether a route's first word belongs to a link kind `parseAppLink` reads. */
export const isLinkHead = (head: string): boolean => LINK_PARSERS.has(head);

/**
 * Reads a deep link: `<scheme>://agent/<hostId>[/<paneId>]`, `<scheme>://agent?host=&session=&pane=`,
 * the Live Activity buttons' `<scheme>://agent/<hostId>/<paneId>?answer=approve|deny&bid=<episode>`,
 * and the widgets' `<scheme>://usage[/limits][?host=<id>]`. Also takes the path form Expo Router
 * hands over once the scheme is stripped (`/agent/<hostId>/<paneId>`). Pane ids are opaque
 * percent-encoded strings. null when the link is not ours or malformed; other query items are ignored.
 */
export function parseAppLink(url: string): AppLink | null {
  const trimmed = url.trim();
  let authority = '';
  let path = trimmed;
  let queryText: string | undefined;
  const shaped = URL_SHAPE.exec(trimmed);
  if (shaped) {
    const scheme = (shaped[1] ?? '').toLowerCase();
    if (!(LINK_SCHEMES as readonly string[]).includes(scheme)) return null;
    authority = shaped[2] ?? '';
    path = shaped[3] ?? '';
    queryText = shaped[4];
  } else {
    if (!trimmed.startsWith('/')) return null;
    const cut = trimmed.indexOf('?');
    path = cut < 0 ? trimmed : trimmed.slice(0, cut);
    queryText = cut < 0 ? undefined : trimmed.slice(cut + 1).split('#')[0];
  }
  const segments = splitPath(path);
  const query = queryItems(queryText);
  if (!segments || !query) return null;
  const head = authority !== '' ? decode(authority) : segments.shift();
  const parse = head === undefined || head === null ? undefined : LINK_PARSERS.get(head);
  return parse ? parse(segments, query) : null;
}

function encode(part: string): string {
  return encodeURIComponent(part);
}

/** A tap on one agent row: opens that agent's detail. */
export function agentUrl(hostId: string, paneId: string): string {
  return `${LINK_SCHEMES[0]}://agent/${encode(hostId)}/${encode(paneId)}`;
}

/** A tap outside any row: opens the Console. */
export function consoleUrl(hostId: string): string {
  return `${LINK_SCHEMES[0]}://agent/${encode(hostId)}`;
}
