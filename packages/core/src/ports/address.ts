import { parseIPv4, parseIPv6 } from '../hosts/ssh-route';

/** Canonical text of 16 address bytes: lowercase, the longest zero run (2+ groups) as `::`. */
export function ipv6Text(bytes: readonly number[]): string {
  const groups: number[] = [];
  for (let index = 0; index < 16; index += 2) {
    groups.push(((bytes[index] ?? 0) << 8) | (bytes[index + 1] ?? 0));
  }
  let bestStart = -1;
  let bestLength = 0;
  for (let start = 0; start < 8; ) {
    if (groups[start] !== 0) {
      start++;
      continue;
    }
    let end = start;
    while (end < 8 && groups[end] === 0) end++;
    if (end - start > bestLength) {
      bestStart = start;
      bestLength = end - start;
    }
    start = end;
  }
  const hex = (slice: number[]) => slice.map((group) => group.toString(16)).join(':');
  if (bestLength < 2) return hex(groups);
  return `${hex(groups.slice(0, bestStart))}::${hex(groups.slice(bestStart + bestLength))}`;
}

/** Canonical text of 4 or 16 address bytes; an IPv4-mapped IPv6 address comes back as IPv4. */
export function numericText(bytes: readonly number[]): string | null {
  if (bytes.length === 4) return bytes.join('.');
  if (bytes.length !== 16) return null;
  if (bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return bytes.slice(12).join('.');
  }
  return ipv6Text(bytes);
}

/**
 * The wildcards as `0.0.0.0` and `::`, IPv4-mapped IPv6 as IPv4, an IPv4 interface scope
 * (`127.0.0.53%lo`) dropped, IPv6 canonical. An IPv6 scope stays, so such an address has no target.
 */
export function normalizedAddress(text: string): string {
  let address = text.toLowerCase();
  if (address === '*') return '0.0.0.0';
  if (address.startsWith('::ffff:') && !address.slice(7).includes(':')) address = address.slice(7);
  if (!address.includes(':')) {
    const scope = address.indexOf('%');
    if (scope >= 0) address = address.slice(0, scope);
  }
  if (address.includes(':') && !address.includes('%')) {
    const bytes = parseIPv6(address);
    if (bytes) return numericText(bytes) ?? address;
  }
  return address;
}

/** A whole decimal number in 1...65535, or null. */
export function parsePort(text: string): number | null {
  if (!/^[0-9]{1,5}$/.test(text)) return null;
  const value = Number(text);
  return value >= 1 && value <= 65535 ? value : null;
}

/**
 * `host:port`, `[v6]:port`, `:::port` (net-tools' IPv6 wildcard) and `*:port`. Null without a
 * port in 1...65535.
 */
export function splitHostPort(text: string): { host: string; port: number } | null {
  const colon = text.lastIndexOf(':');
  if (colon < 0) return null;
  const port = parsePort(text.slice(colon + 1));
  if (port === null) return null;
  let host = text.slice(0, colon);
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  return host === '' ? null : { host, port };
}

function isAllowedIPv4(bytes: readonly number[]): boolean {
  const [first = 0, second = 0] = bytes;
  return (
    first === 127 ||
    first === 10 ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    (first === 172 && (second & 0xf0) === 16)
  );
}

function isAllowedIPv6(bytes: readonly number[]): boolean {
  const [first = 0, second = 0] = bytes;
  if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) return true;
  if ((first & 0xfe) === 0xfc) return true;
  return first === 0xfe && (second & 0xc0) === 0x80;
}

/**
 * The SSH layer's own rule for a direct-tcpip target (the Swift `SSHTCPTarget`): the Host's
 * loopback, private or link-local numeric address, as canonical text; null for a hostname, a
 * scoped or public address. Allowed: 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1,
 * fc00::/7, fe80::/10.
 */
export function canonicalAllowedAddress(address: string): string | null {
  if (address === '' || address.length > 46 || address.includes('%')) return null;
  if (!/^[\x21-\x7e]+$/.test(address)) return null;
  const v4 = parseIPv4(address);
  if (v4) return isAllowedIPv4(v4) ? v4.join('.') : null;
  const v6 = parseIPv6(address);
  if (v6) return isAllowedIPv6(v6) ? ipv6Text(v6) : null;
  return null;
}
