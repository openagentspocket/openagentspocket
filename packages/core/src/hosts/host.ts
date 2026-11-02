import {
  decodeHerdrEndpoint,
  type HerdrEndpoint,
  type HerdrSocketLocation,
  isValidHerdrSessionName,
  socketLocationFor,
} from './herdr-endpoint';
import { trimSpaces } from './text';

/** How the app authenticates against a Host. RSA keys are deferred in the port. */
export type AuthMethod = 'deviceKey' | 'rsaKey' | 'password';
export const AUTH_METHODS: readonly AuthMethod[] = ['deviceKey', 'rsaKey', 'password'];

export type NonEmptyArray<T> = readonly [T, ...T[]];

/**
 * One way to reach a Host: the address to dial and, optionally, a Jump Host in
 * front of it. A Host lists one or more; the Console races them and keeps the
 * first that reaches the Host. Overlay Networks are dropped in the port.
 */
export interface HostRoute {
  readonly id: string;
  readonly address: string;
  readonly port: number;
  /** Blank means the device dials `address` itself. */
  readonly jumpAddress: string;
  readonly jumpPort: number;
  /** Blank reuses the Host's `username`. */
  readonly jumpUsername: string;
}

/**
 * A user-added Host. Never carries a secret: the password lives in secure
 * storage keyed by `id`, and private keys stay native.
 */
export interface Host {
  readonly id: string;
  /** Optional display label; blank falls back to `user@address`. */
  readonly name: string;
  readonly username: string;
  readonly authMethod: AuthMethod;
  /** Blank means the default herdr session. */
  readonly sessionName: string;
  /** A Pairing Code v2 endpoint; when set it wins over `sessionName`. */
  readonly herdrEndpoint: HerdrEndpoint | null;
  /** In the user's order; the first is the primary route. */
  readonly routes: NonEmptyArray<HostRoute>;
}

/** A route with the defaults of a direct connection on port 22. */
export function hostRoute(
  fields: Pick<HostRoute, 'id' | 'address'> & Partial<HostRoute>,
): HostRoute {
  return { port: 22, jumpAddress: '', jumpPort: 22, jumpUsername: '', ...fields };
}

export function routeUsesJumpHost(route: HostRoute): boolean {
  return trimSpaces(route.jumpAddress) !== '';
}

/** The address the device itself dials: the Jump Host's when there is one. */
export function routeFirstHopAddress(route: HostRoute): string {
  return routeUsesJumpHost(route) ? route.jumpAddress : route.address;
}

/** `address`, with the port when it is not 22. */
export function routeEndpoint(route: HostRoute): string {
  return route.port === 22 ? route.address : `${route.address}:${route.port}`;
}

/** One line naming how a route reaches the Host: `127.0.0.1:2222 via vps.example:2022`. */
export function routeSummary(route: HostRoute): string {
  if (!routeUsesJumpHost(route)) return routeEndpoint(route);
  const jump = trimSpaces(route.jumpAddress);
  return `${routeEndpoint(route)} via ${route.jumpPort === 22 ? jump : `${jump}:${route.jumpPort}`}`;
}

export function primaryRoute(host: Host): HostRoute {
  return host.routes[0];
}

/** The Jump Host account on `route`, falling back to the Host's own username. */
export function jumpUsernameOn(host: Host, route: HostRoute): string {
  const trimmed = trimSpaces(route.jumpUsername);
  return trimmed === '' ? host.username : trimmed;
}

/** Whether `address` names this Host on any route, ignoring case and edge spaces. */
export function hostAnswersToAddress(host: Host, address: string): boolean {
  const wanted = trimSpaces(address).toLowerCase();
  return host.routes.some((route) => trimSpaces(route.address).toLowerCase() === wanted);
}

export function hostDisplayName(host: Host): string {
  const trimmed = trimSpaces(host.name);
  return trimmed === '' ? `${host.username}@${primaryRoute(host).address}` : trimmed;
}

/**
 * How the Host is reached: `user@address[:port]` for one route. With several,
 * which one a connection took is not known yet, so the UI names the count.
 */
export type HostConnectionSummary =
  | { readonly kind: 'address'; readonly text: string }
  | { readonly kind: 'routes'; readonly username: string; readonly count: number };

export function hostConnectionSummary(host: Host): HostConnectionSummary {
  if (host.routes.length !== 1) {
    return { kind: 'routes', username: host.username, count: host.routes.length };
  }
  return { kind: 'address', text: `${host.username}@${routeEndpoint(primaryRoute(host))}` };
}

export function hostSocketLocation(host: Host): HerdrSocketLocation {
  return socketLocationFor(host.sessionName, host.herdrEndpoint);
}

function isPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535;
}

function optionalString(value: unknown, fallback: string): string | null {
  if (value === undefined) return fallback;
  return typeof value === 'string' ? value : null;
}

function decodeRoute(value: unknown): HostRoute | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const jumpAddress = optionalString(raw.jumpAddress, '');
  const jumpUsername = optionalString(raw.jumpUsername, '');
  const jumpPort = raw.jumpPort === undefined ? 22 : raw.jumpPort;
  if (typeof raw.id !== 'string' || typeof raw.address !== 'string' || !isPort(raw.port)) {
    return null;
  }
  if (jumpAddress === null || jumpUsername === null || !isPort(jumpPort)) return null;
  return { id: raw.id, address: raw.address, port: raw.port, jumpAddress, jumpPort, jumpUsername };
}

/**
 * Reads a Host from storage. null when anything is malformed: an unknown
 * authentication method, an invalid session name, an endpoint that breaks the
 * v2 rules (dropping it would point the Host at the user's own herdr), or no
 * routes.
 */
export function decodeHost(value: unknown): Host | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const { id, name, username, authMethod } = raw;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof username !== 'string') {
    return null;
  }
  if (!AUTH_METHODS.includes(authMethod as AuthMethod)) return null;
  const sessionName = optionalString(raw.sessionName, '');
  if (sessionName === null) return null;
  const trimmedSession = trimSpaces(sessionName);
  if (trimmedSession !== '' && !isValidHerdrSessionName(trimmedSession)) return null;
  let herdrEndpoint: HerdrEndpoint | null = null;
  if (raw.herdrEndpoint !== undefined && raw.herdrEndpoint !== null) {
    herdrEndpoint = decodeHerdrEndpoint(raw.herdrEndpoint);
    if (!herdrEndpoint) return null;
  }
  if (!Array.isArray(raw.routes)) return null;
  const routes = raw.routes.map(decodeRoute);
  const [first, ...rest] = routes;
  if (!first || rest.some((route) => route === null)) return null;
  return {
    id,
    name,
    username,
    authMethod: authMethod as AuthMethod,
    sessionName,
    herdrEndpoint,
    routes: [first, ...(rest as HostRoute[])],
  };
}
