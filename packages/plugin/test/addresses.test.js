import { test, suite } from "node:test";
import assert from "node:assert/strict";

import { candidateAddresses, withConfiguredAddresses } from "../src/addresses.js";

function iface(address, family, internal = false) {
  return { address, family, internal };
}

suite("candidateAddresses", () => {
  test("skips loopback and link-local, keeps routable addresses", () => {
    const candidates = candidateAddresses({
      lo0: [iface("127.0.0.1", "IPv4", true), iface("::1", "IPv6", true)],
      en0: [
        iface("192.168.1.42", "IPv4"),
        iface("169.254.10.20", "IPv4"),
        iface("fe80::1c2d:3e4f:5a6b:7c8d", "IPv6"),
        iface("2001:db8:85a3::8a2e:370:7334", "IPv6"),
      ],
    });
    assert.deepEqual(
      candidates.map((c) => c.address),
      ["192.168.1.42", "2001:db8:85a3::8a2e:370:7334"],
    );
  });

  test("pre-checks en0's likely address and the overlay address on macOS, LAN first", () => {
    const candidates = candidateAddresses(
      {
        en1: [iface("10.0.0.7", "IPv4")],
        en0: [iface("192.168.1.42", "IPv4"), iface("2001:db8::7", "IPv6")],
        utun3: [iface("100.101.102.103", "IPv4"), iface("fd7a:115c:a1e0::1", "IPv6")],
        en2: [iface("203.0.113.9", "IPv4")],
      },
      "darwin",
    );
    const byAddress = Object.fromEntries(candidates.map((c) => [c.address, c.preChecked]));
    assert.deepEqual(byAddress, {
      "192.168.1.42": true,
      "10.0.0.7": false,
      "100.101.102.103": true,
      "fd7a:115c:a1e0::1": false,
      "2001:db8::7": false,
      "203.0.113.9": false,
    });
    assert.deepEqual(
      candidates.slice(0, 2).map((c) => c.address),
      ["192.168.1.42", "100.101.102.103"],
    );
  });

  test("pre-checks only eth0's likely address on Linux without an overlay", () => {
    const candidates = candidateAddresses(
      {
        docker0: [iface("172.17.0.1", "IPv4")],
        wlan0: [iface("192.168.0.5", "IPv4")],
        eth0: [iface("10.1.2.3", "IPv4")],
      },
      "linux",
    );
    const byAddress = Object.fromEntries(candidates.map((c) => [c.address, c.preChecked]));
    assert.deepEqual(byAddress, {
      "10.1.2.3": true,
      "192.168.0.5": false,
      "172.17.0.1": false,
    });
  });

  test("falls back to the best-ranked likely candidate when the primary interface is absent", () => {
    const candidates = candidateAddresses(
      {
        utun3: [iface("fd7a:115c:a1e0::1", "IPv6")],
        en5: [iface("192.168.1.42", "IPv4")],
      },
      "darwin",
    );
    const byAddress = Object.fromEntries(candidates.map((c) => [c.address, c.preChecked]));
    assert.deepEqual(byAddress, {
      "192.168.1.42": true,
      "fd7a:115c:a1e0::1": false,
    });
  });

  test("never pre-checks a public address, even on the primary interface", () => {
    const candidates = candidateAddresses(
      {
        en0: [iface("203.0.113.9", "IPv4")],
        en1: [iface("192.168.1.42", "IPv4")],
      },
      "darwin",
    );
    const byAddress = Object.fromEntries(candidates.map((c) => [c.address, c.preChecked]));
    assert.deepEqual(byAddress, {
      "192.168.1.42": true,
      "203.0.113.9": false,
    });
  });

  test("does not pre-check IPv4 outside private/CGNAT ranges", () => {
    const candidates = candidateAddresses({
      en0: [
        iface("172.15.0.1", "IPv4"),
        iface("172.32.0.1", "IPv4"),
        iface("100.63.255.255", "IPv4"),
        iface("100.128.0.1", "IPv4"),
      ],
    });
    assert.deepEqual(
      candidates.map((c) => c.preChecked),
      [false, false, false, false],
    );
  });

  test("orders the pre-checked default first, then likely IPv4/IPv6, then the rest", () => {
    const candidates = candidateAddresses(
      {
        en0: [iface("2001:db8::7", "IPv6"), iface("203.0.113.9", "IPv4")],
        utun3: [iface("fd7a:115c:a1e0::1", "IPv6"), iface("100.101.102.103", "IPv4")],
        en1: [iface("192.168.1.42", "IPv4")],
      },
      "linux",
    );
    assert.deepEqual(
      candidates.map((c) => c.address),
      [
        "192.168.1.42",
        "100.101.102.103",
        "fd7a:115c:a1e0::1",
        "203.0.113.9",
        "2001:db8::7",
      ],
    );
  });

  test("strips IPv6 zone ids and deduplicates repeated addresses", () => {
    const candidates = candidateAddresses({
      utun0: [iface("fd7a:115c:a1e0::1%utun0", "IPv6")],
      utun1: [iface("fd7a:115c:a1e0::1", "IPv6")],
    });
    assert.deepEqual(candidates.map((c) => c.address), ["fd7a:115c:a1e0::1"]);
  });

  test("reports the owning interface name", () => {
    const candidates = candidateAddresses({
      en0: [iface("192.168.1.42", "IPv4")],
    });
    assert.deepEqual(candidates, [
      { address: "192.168.1.42", family: "IPv4", interfaceName: "en0", preChecked: true },
    ]);
  });

  test("pre-checks the overlay alone when it is the only default, and lists Docker addresses last without removing them", () => {
    const candidates = candidateAddresses(
      {
        lo: [iface("127.0.0.1", "IPv4", true)],
        docker0: [iface("172.17.0.1", "IPv4")],
        "br-6b73c0427855": [iface("172.18.0.1", "IPv4")],
        "br-295b62ad6116": [iface("172.19.0.1", "IPv4")],
        veth1a2b3c4: [iface("172.20.0.2", "IPv4")],
        tailscale0: [iface("100.64.0.5", "IPv4"), iface("fd7a:115c:a1e0::1", "IPv6")],
        eth0: [iface("203.0.113.9", "IPv4"), iface("2001:db8::7", "IPv6")],
      },
      "linux",
    );
    assert.deepEqual(
      candidates.map((c) => c.address),
      [
        "100.64.0.5",
        "fd7a:115c:a1e0::1",
        "203.0.113.9",
        "2001:db8::7",
        "172.17.0.1",
        "172.18.0.1",
        "172.19.0.1",
        "172.20.0.2",
      ],
    );
    assert.deepEqual(
      candidates.filter((c) => c.preChecked).map((c) => c.address),
      ["100.64.0.5"],
    );
  });

  test("a Docker alias cannot hide the primary interface's default address", () => {
    const candidates = candidateAddresses(
      {
        docker0: [iface("192.168.1.42", "IPv4")],
        tailscale0: [iface("100.64.0.5", "IPv4")],
        eth0: [iface("192.168.1.42", "IPv4")],
      },
      "linux",
    );
    assert.deepEqual(candidates, [
      { address: "192.168.1.42", family: "IPv4", interfaceName: "eth0", preChecked: true },
      { address: "100.64.0.5", family: "IPv4", interfaceName: "tailscale0", preChecked: true },
    ]);
  });

  test("keeps a normal LAN bridge eligible as the default address", () => {
    const candidates = candidateAddresses(
      { bridge0: [iface("192.168.1.42", "IPv4")] },
      "darwin",
    );
    assert.deepEqual(candidates, [
      { address: "192.168.1.42", family: "IPv4", interfaceName: "bridge0", preChecked: true },
    ]);
  });

  test("returns an empty list when nothing is routable", () => {
    assert.deepEqual(candidateAddresses({ lo0: [iface("127.0.0.1", "IPv4", true)] }), []);
  });
});

suite("candidateAddresses overlay default", () => {
  const checked = (candidates) => candidates.filter((c) => c.preChecked).map((c) => c.address);

  test("LAN only: one default", () => {
    assert.deepEqual(
      checked(candidateAddresses({ eth0: [iface("192.168.1.42", "IPv4")] }, "linux")),
      ["192.168.1.42"],
    );
  });

  test("LAN plus overlay: LAN first, overlay second, whatever the interface order", () => {
    const candidates = candidateAddresses(
      {
        tailscale0: [iface("100.100.0.5", "IPv4")],
        eth0: [iface("192.168.1.42", "IPv4")],
      },
      "linux",
    );
    assert.deepEqual(checked(candidates), ["192.168.1.42", "100.100.0.5"]);
    assert.deepEqual(candidates.map((c) => c.address), ["192.168.1.42", "100.100.0.5"]);
  });

  test("overlay only: the overlay is the default", () => {
    assert.deepEqual(
      checked(candidateAddresses({ utun4: [iface("100.100.0.5", "IPv4")] }, "darwin")),
      ["100.100.0.5"],
    );
  });

  test("a CGNAT address on a non-tunnel interface is not an overlay", () => {
    const candidates = candidateAddresses(
      {
        en0: [iface("198.51.100.7", "IPv4")],
        en1: [iface("192.168.1.42", "IPv4")],
        en2: [iface("100.70.1.1", "IPv4")],
      },
      "darwin",
    );
    assert.deepEqual(checked(candidates), ["192.168.1.42"]);
  });

  test("an address outside 100.64/10 on a tunnel interface is not an overlay", () => {
    const candidates = candidateAddresses(
      { eth0: [iface("192.168.1.42", "IPv4")], utun3: [iface("100.128.0.1", "IPv4")] },
      "darwin",
    );
    assert.deepEqual(checked(candidates), ["192.168.1.42"]);
  });

  test("Docker addresses are never the LAN or the overlay default", () => {
    const candidates = candidateAddresses(
      {
        docker0: [iface("172.17.0.1", "IPv4")],
        "br-6b73c0427855": [iface("100.90.0.1", "IPv4")],
        eth0: [iface("192.168.1.42", "IPv4")],
        tailscale0: [iface("100.100.0.5", "IPv4")],
      },
      "linux",
    );
    assert.deepEqual(checked(candidates), ["192.168.1.42", "100.100.0.5"]);
  });

  test("an overlay IPv6 ULA is not pre-checked as a third route", () => {
    const withV4 = candidateAddresses(
      {
        eth0: [iface("192.168.1.42", "IPv4")],
        tailscale0: [iface("fd7a:115c:a1e0::1", "IPv6"), iface("100.100.0.5", "IPv4")],
      },
      "linux",
    );
    assert.deepEqual(checked(withV4), ["192.168.1.42", "100.100.0.5"]);
    const withoutV4 = candidateAddresses(
      {
        eth0: [iface("192.168.1.42", "IPv4")],
        tailscale0: [iface("fd7a:115c:a1e0::1", "IPv6")],
      },
      "linux",
    );
    assert.deepEqual(checked(withoutV4), ["192.168.1.42"]);
  });
});

suite("withConfiguredAddresses", () => {
  const enumerated = [
    { address: "172.17.0.2", family: "IPv4", interfaceName: "eth0", preChecked: true },
    { address: "192.168.1.10", family: "IPv4", interfaceName: "eth1", preChecked: false },
  ];

  test("leaves the enumeration alone without configured addresses", () => {
    assert.deepEqual(withConfiguredAddresses(enumerated, []), enumerated);
  });

  test("lists configured addresses first and pre-checks only them", () => {
    const candidates = withConfiguredAddresses(enumerated, [
      "nas.example.com",
      "192.168.1.10",
      "fd7a:115c:a1e0::1",
    ]);
    assert.deepEqual(candidates, [
      { address: "nas.example.com", family: "name", interfaceName: "pair.json", preChecked: true },
      { address: "192.168.1.10", family: "IPv4", interfaceName: "pair.json", preChecked: true },
      { address: "fd7a:115c:a1e0::1", family: "IPv6", interfaceName: "pair.json", preChecked: true },
      { address: "172.17.0.2", family: "IPv4", interfaceName: "eth0", preChecked: false },
    ]);
  });

  test("offers configured addresses when no interface has one", () => {
    assert.deepEqual(
      withConfiguredAddresses([], ["192.168.1.10"]).map((c) => c.address),
      ["192.168.1.10"],
    );
  });
});
