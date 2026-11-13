// Candidate address enumeration for the Pairing Code (ADR 0007).
//
// The Pairing Code carries user-selected candidate addresses; this module
// enumerates them and pre-checks at most two defaults, LAN first and overlay
// second: a likely non-Docker candidate (private LAN, ULA) on the platform's
// primary interface (en0 on macOS, eth0 on Linux), falling back to the
// best-ranked likely non-Docker candidate off a tunnel interface; plus one
// overlay address, which stays valid when the router hands the computer a new
// LAN address. Docker addresses remain available for manual selection at the
// end of the list.

import { isIP } from "node:net";
import os from "node:os";

function ipv4Octets(address) {
  return address.split(".").map(Number);
}

function isIpv4LinkLocal(address) {
  const [a, b] = ipv4Octets(address);
  return a === 169 && b === 254;
}

function isIpv4Likely(address) {
  const [a, b] = ipv4Octets(address);
  if (a === 10) return true; // 10/8 private
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
  if (a === 192 && b === 168) return true; // 192.168/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT (Tailscale)
  return false;
}

function isIpv6LinkLocal(address) {
  return /^fe[89ab]/i.test(address); // fe80::/10
}

function isIpv6Likely(address) {
  return /^f[cd]/i.test(address); // fc00::/7 ULA (includes Tailscale fd7a:...)
}

const PRIMARY_INTERFACE_BY_PLATFORM = { darwin: "en0", linux: "eth0" };

// Interface names are only a hint, not proof of reachability. Keep these
// Docker/container addresses available for manual selection, but do not
// pre-check them or let them bury ordinary Host addresses. Generic bridges
// such as bridge0 can carry the Host's LAN address and are not classified.
const DOCKER_INTERFACE_PATTERNS = [
  /^docker\d*$/i, // docker0
  /^br-[0-9a-f]+$/i, // docker user-defined bridges
  /^veth/i, // container veth pairs
];

// An overlay address is an IPv4 address in 100.64.0.0/10 on a tunnel
// interface (tailscale0 on Linux, "Tailscale" on Windows, utunN on macOS).
// The range alone is not enough: it is also carrier-grade NAT, so the same
// address on an ordinary Ethernet or Wi-Fi interface is a LAN-like address
// that changes with the router. Known false negatives: an overlay on an
// interface with another name (a renamed or WireGuard-only interface), and
// an IPv6-only overlay (IPv6 ULA addresses are never pre-checked as overlay).
// Known false positive: another VPN client that uses a utunN interface with a
// 100.64/10 address.
const TUNNEL_INTERFACE_PATTERNS = [/^tailscale\d*$/i, /^utun\d+$/i];

function isTunnelInterface(interfaceName) {
  return TUNNEL_INTERFACE_PATTERNS.some((pattern) => pattern.test(interfaceName));
}

function isCgnat(address) {
  const [a, b] = ipv4Octets(address);
  return a === 100 && b >= 64 && b <= 127;
}

function isDockerInterface(interfaceName) {
  return DOCKER_INTERFACE_PATTERNS.some((pattern) => pattern.test(interfaceName));
}

/**
 * Enumerate candidate addresses for the Pairing Code.
 *
 * Skips loopback and link-local addresses. Pre-checks at most two likely
 * non-Docker addresses, in this order: the LAN address (the platform's
 * primary interface, else the best-ranked likely address off a tunnel
 * interface) and one overlay address (IPv4 in 100.64/10 on a tunnel
 * interface; see TUNNEL_INTERFACE_PATTERNS). Two routes survive a LAN address change; a third
 * would only lengthen the Pairing Code, so IPv6 and further addresses stay
 * unchecked. With no LAN address the overlay is the only default; with
 * neither, the best-ranked likely address is. Docker addresses follow all
 * other candidates and are never pre-checked. Within each group, likely
 * addresses precede unlikely ones, then IPv4 precedes IPv6, otherwise input
 * order is preserved.
 *
 * @param {ReturnType<typeof os.networkInterfaces>} [interfaces]
 * @param {NodeJS.Platform} [platform]
 * @returns {{address: string, family: "IPv4"|"IPv6", interfaceName: string, preChecked: boolean}[]}
 */
export function candidateAddresses(
  interfaces = os.networkInterfaces(),
  platform = process.platform,
) {
  const candidates = [];

  for (const [interfaceName, entries] of Object.entries(interfaces)) {
    const docker = isDockerInterface(interfaceName);
    for (const entry of entries ?? []) {
      if (entry.internal) continue;
      const { family } = entry;
      // Zone ids (fe80::1%en0) are meaningless off-machine.
      const address = entry.address.split("%")[0];

      let likely;
      if (family === "IPv4") {
        if (isIpv4LinkLocal(address)) continue;
        likely = isIpv4Likely(address);
      } else if (family === "IPv6") {
        if (isIpv6LinkLocal(address)) continue;
        likely = isIpv6Likely(address);
      } else {
        continue;
      }

      const tunnel = isTunnelInterface(interfaceName);
      const overlay = tunnel && family === "IPv4" && isCgnat(address);
      candidates.push({ address, family, interfaceName, likely, docker, tunnel, overlay });
    }
  }

  const candidateRank = (c) =>
    (c.docker ? 4 : 0) + (c.likely ? 0 : 2) + (c.family === "IPv4" ? 0 : 1);
  // Sort before deduplicating so a Docker alias cannot hide an ordinary
  // interface carrying the same address. Stable sorting preserves input ties.
  const seen = new Set();
  const ordered = candidates
    .sort((a, b) => candidateRank(a) - candidateRank(b))
    .filter(({ address }) => {
      if (seen.has(address)) return false;
      seen.add(address);
      return true;
    });

  const primary = PRIMARY_INTERFACE_BY_PLATFORM[platform];
  const usable = ordered.filter((c) => !c.docker && c.likely);
  const lan =
    usable.find((c) => !c.tunnel && c.interfaceName === primary) ??
    usable.find((c) => !c.tunnel);
  const overlay = usable.find((c) => c.overlay);
  const defaults = [lan, overlay].filter((c) => c !== undefined);
  if (defaults.length === 0 && usable.length > 0) defaults.push(usable[0]);
  const defaultIndex = (c) => {
    const index = defaults.findIndex((d) => d.address === c.address);
    return index === -1 ? defaults.length : index;
  };

  // Defaults first, LAN ahead of overlay; the sort is stable for the rest.
  return [...ordered]
    .sort((a, b) => defaultIndex(a) - defaultIndex(b))
    .map(({ likely, docker, tunnel, overlay: _overlay, ...candidate }) => ({
      ...candidate,
      preChecked: defaultIndex(candidate) < defaults.length,
    }));
}

/**
 * Put the addresses configured in `pair.json` ahead of the enumerated
 * candidates. Configured addresses are pre-checked: the operator named them
 * because the interfaces cannot show them (a container behind a published
 * port, a NAT, a DNS name). Enumerated candidates follow unchecked, minus any
 * address already configured.
 *
 * @param {ReturnType<typeof candidateAddresses>} candidates
 * @param {string[]} configured
 */
export function withConfiguredAddresses(candidates, configured) {
  if (configured.length === 0) return candidates;
  const family = (address) => ({ 4: "IPv4", 6: "IPv6" })[isIP(address)] ?? "name";
  const listed = new Set(configured);
  return [
    ...configured.map((address) => ({
      address,
      family: family(address),
      interfaceName: "pair.json",
      preChecked: true,
    })),
    ...candidates
      .filter(({ address }) => !listed.has(address))
      .map((candidate) => ({ ...candidate, preChecked: false })),
  ];
}
