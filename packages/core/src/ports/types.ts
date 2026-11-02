import { message, type Text } from '../errors/text';
import { canonicalAllowedAddress } from './address';

/**
 * The server a browser preview tunnel reaches on the Host. Computed from the Host's own listener
 * list; there is no case for a typed hostname, and `hostAddress` is re-validated against the SSH
 * layer's range rule before a channel opens.
 */
export type ForwardTarget =
  /** `127.0.0.1`: servers bound to it or to the wildcard address. */
  | { readonly kind: 'loopbackV4'; readonly port: number }
  /** `::1`: servers bound to the IPv6 loopback only. */
  | { readonly kind: 'loopbackV6'; readonly port: number }
  /** One of the Host's own private or link-local addresses, as a numeric literal. */
  | { readonly kind: 'hostAddress'; readonly address: string; readonly port: number };

export type BindScope =
  /** `0.0.0.0`, `::` or the dual-stack `*`. */
  | { readonly kind: 'allInterfaces' }
  /** 127.0.0.0/8 or `::1`. */
  | { readonly kind: 'loopback' }
  /** One specific address of the Host. */
  | { readonly kind: 'address'; readonly address: string };

/**
 * One TCP server listening on a Host, as the port discovery found it: one row of the Web Servers
 * list. Several sockets on one port are merged into a row that keeps the most reachable address.
 */
export interface ListeningPort {
  readonly port: number;
  /** Normalised: no brackets, IPv4-mapped IPv6 as IPv4, wildcards as `0.0.0.0` and `::`. */
  readonly address: string;
  readonly pid: number | null;
  /** The owning process, when the Host lets the user see it. */
  readonly processName: string | null;
  /** The Docker container publishing this port, from `docker ps`. */
  readonly containerName: string | null;
  readonly image: string | null;
}

/** What one port discovery returned. */
export interface ListeningPortReport {
  /** Sorted: shown rows first, containers and likely web servers before the rest, then by port. */
  readonly ports: readonly ListeningPort[];
  /** The Host had more servers than the list holds (`PROBE_CAP.listeners`). */
  readonly isTruncated: boolean;
  /** `docker ps` answered; false when Docker is absent, stopped, or unreadable. */
  readonly readContainers: boolean;
}

/**
 * Where a tunnel to `address:port` leads: the wildcard and `127.0.0.1` reach the Host's IPv4
 * loopback; `::` leads to `::1`, which reaches both a dual-stack and a v6-only socket; any other
 * address must pass the SSH layer's range check. Null when the preview must not reach it.
 */
export function forwardTargetFor(address: string, port: number): ForwardTarget | null {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  switch (address) {
    case '0.0.0.0':
    case '127.0.0.1':
      return { kind: 'loopbackV4', port };
    case '::':
    case '::1':
      return { kind: 'loopbackV6', port };
    default: {
      const validated = canonicalAllowedAddress(address);
      return validated ? { kind: 'hostAddress', address: validated, port } : null;
    }
  }
}

export function forwardTarget(listening: ListeningPort): ForwardTarget | null {
  return forwardTargetFor(listening.address, listening.port);
}

/** The Host-side address an SSH direct-tcpip channel is opened to. */
export function targetHost(target: ForwardTarget): string {
  switch (target.kind) {
    case 'loopbackV4':
      return '127.0.0.1';
    case 'loopbackV6':
      return '::1';
    case 'hostAddress':
      return target.address;
  }
}

export function bindScope(listening: ListeningPort): BindScope {
  const { address } = listening;
  if (address === '0.0.0.0' || address === '::') return { kind: 'allInterfaces' };
  if (address === '::1' || address.startsWith('127.')) return { kind: 'loopback' };
  return { kind: 'address', address };
}

/** The row title: the container, the process, or the bare port. */
export function displayName(listening: ListeningPort): Text {
  if (listening.containerName !== null) return listening.containerName;
  // `docker-proxy` alone means a container `docker ps` did not name.
  if (listening.processName === 'docker-proxy') return message('container');
  // As text: a port number takes no digit grouping.
  return listening.processName ?? message('port %@', String(listening.port));
}

/** System ports, sshd and herdr sit behind "Show all". */
export function isHiddenByDefault(listening: ListeningPort): boolean {
  if (listening.port < 1024) return true;
  const name = listening.processName;
  return name !== null && (name.startsWith('sshd') || name === 'herdr');
}

const HTTP_PORTS = new Set([
  3000, 3001, 4000, 4200, 4321, 5000, 5173, 5174, 8000, 8008, 8080, 8081, 8443, 8888, 9000,
]);

const HTTP_PROCESS_NAMES = new Set([
  'node',
  'bun',
  'deno',
  'python',
  'python3',
  'ruby',
  'php',
  'php-fpm',
  'nginx',
  'caddy',
  'httpd',
  'apache2',
  'uvicorn',
  'gunicorn',
  'vite',
  'next-server',
  'hugo',
  'jupyter-lab',
]);

/** A guess for sorting only: containers and common web servers first. Never refuses a row. */
export function isLikelyHTTP(listening: ListeningPort): boolean {
  if (listening.containerName !== null) return true;
  if (HTTP_PORTS.has(listening.port)) return true;
  const name = listening.processName;
  return name !== null && HTTP_PROCESS_NAMES.has(name.toLowerCase());
}

/** A row can open when its address is one the preview may reach; public or scoped ones show disabled. */
export function canOpen(listening: ListeningPort): boolean {
  return forwardTarget(listening) !== null;
}
