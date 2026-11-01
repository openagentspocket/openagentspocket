import { type Host, jumpUsernameOn, routeUsesJumpHost } from './host';
import { trimSpaces } from './text';

/** The Jump Host in front of a route; its key is trusted by its own endpoint. */
export interface SSHJump {
  readonly host: string;
  readonly port: number;
  readonly username: string;
}

/** One way the transport reaches a Host: its address, optionally via a Jump Host. */
export interface SSHRoute {
  readonly host: string;
  readonly port: number;
  readonly jump: SSHJump | null;
  /** The catalog route (`HostRoute.id`) this is; null outside the catalog. */
  readonly id: string | null;
}

/** Every route of a catalog Host, in order, as the transport dials them. */
export function sshRoutesForHost(host: Host): SSHRoute[] {
  return host.routes.map((route) => ({
    host: trimSpaces(route.address),
    port: route.port,
    jump: routeUsesJumpHost(route)
      ? {
          host: trimSpaces(route.jumpAddress),
          port: route.jumpPort,
          username: jumpUsernameOn(host, route),
        }
      : null,
    id: route.id,
  }));
}

/**
 * The device dials the Host itself. Direct routes start a race at once; the
 * others wait a moment, so a reachable LAN address wins without starting a
 * Jump Host connection.
 */
export function isDirectRoute(route: SSHRoute): boolean {
  return route.jump === null;
}

/**
 * Whether the address may name another machine once the device is on another
 * network: a direct route to a loopback, private, link-local or unique-local
 * address, or to a name only a local network resolves. A changed host key
 * there can be that other machine, not an attack. CGNAT/overlay, public
 * addresses and DNS names name the same machine wherever the device is.
 */
export function mayNameAnotherMachine(route: SSHRoute): boolean {
  return isDirectRoute(route) && isLocallyScoped(route.host);
}

const LOCAL_NAME_SUFFIXES = ['.local', '.lan', '.home', '.home.arpa', '.internal', '.localdomain'];

export function isLocallyScoped(address: string): boolean {
  let host = trimSpaces(address).toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  const zone = host.indexOf('%');
  if (zone >= 0) host = host.slice(0, zone);
  if (host.endsWith('.')) host = host.slice(0, -1);

  const ipv4 = parseIPv4(host);
  if (ipv4) {
    const [first, second] = ipv4;
    return (
      first === 10 ||
      first === 127 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254)
    );
  }
  const ipv6 = parseIPv6(host);
  if (ipv6) {
    const isLoopback = ipv6.slice(0, 15).every((byte) => byte === 0) && ipv6[15] === 1;
    const isUniqueLocal = ((ipv6[0] ?? 0) & 0xfe) === 0xfc;
    const isLinkLocal = ipv6[0] === 0xfe && ((ipv6[1] ?? 0) & 0xc0) === 0x80;
    return isLoopback || isUniqueLocal || isLinkLocal;
  }
  // A single label resolves through the local search domain or mDNS.
  if (!host.includes('.')) return true;
  return LOCAL_NAME_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/** Dotted-quad IPv4 as inet_pton reads it (no leading zeros); null otherwise. */
export function parseIPv4(text: string): [number, number, number, number] | null {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  const bytes = parts.map((part) => {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(part)) return -1;
    const value = Number(part);
    return value <= 255 ? value : -1;
  });
  if (bytes.some((byte) => byte < 0)) return null;
  return bytes as [number, number, number, number];
}

function parseIPv6Groups(text: string, allowIPv4Tail: boolean): number[] | null {
  if (text === '') return [];
  const groups = text.split(':');
  const bytes: number[] = [];
  for (const [index, group] of groups.entries()) {
    if (allowIPv4Tail && index === groups.length - 1 && group.includes('.')) {
      const ipv4 = parseIPv4(group);
      if (!ipv4) return null;
      bytes.push(...ipv4);
    } else {
      if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
      const value = Number.parseInt(group, 16);
      bytes.push(value >> 8, value & 0xff);
    }
  }
  return bytes;
}

/** IPv6 text (with `::` and an IPv4 tail) to its 16 bytes; null otherwise. */
export function parseIPv6(text: string): number[] | null {
  if (!text.includes(':')) return null;
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const [headText = '', tailText] = halves;
  const head = parseIPv6Groups(headText, tailText === undefined);
  if (!head) return null;
  if (tailText === undefined) return head.length === 16 ? head : null;
  const tail = parseIPv6Groups(tailText, true);
  if (!tail) return null;
  const missing = 16 - head.length - tail.length;
  if (missing < 2) return null;
  return [...head, ...new Array<number>(missing).fill(0), ...tail];
}

/** How a failure names a route: `10.0.0.5`, `127.0.0.1:2222 via vps.example:2022`. */
export function routeLabel(route: SSHRoute): string {
  const label = route.port === 22 ? route.host : `${route.host}:${route.port}`;
  if (!route.jump) return label;
  const { host, port } = route.jump;
  return `${label} via ${port === 22 ? host : `${host}:${port}`}`;
}

/** One route's failure when no route reached the Host. */
export interface RouteFailure<E> {
  /** The route as `routeLabel` names it. */
  readonly route: string;
  readonly mayNameAnotherMachine: boolean;
  readonly error: E;
  readonly routeId: string | null;
}

/** Pairs each route with its error, in route order. */
export function routeFailures<E>(
  routes: readonly SSHRoute[],
  errors: readonly E[],
): RouteFailure<E>[] {
  return routes.flatMap((route, index) => {
    if (index >= errors.length) return [];
    return [
      {
        route: routeLabel(route),
        mayNameAnotherMachine: mayNameAnotherMachine(route),
        error: errors[index] as E,
        routeId: route.id,
      },
    ];
  });
}

/**
 * A changed host key on a route that names the same machine wherever the
 * device is stops the race; one at a LAN address is excused, since another
 * machine may answer there away from home.
 */
export function isRouteHostKeySecurityFailure<E>(
  failure: RouteFailure<E>,
  isHostKeySecurityFailure: (error: E) => boolean,
): boolean {
  return !failure.mayNameAnotherMachine && isHostKeySecurityFailure(failure.error);
}
