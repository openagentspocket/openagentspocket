import { describe, expect, it } from 'vitest';
import { renderText } from '../errors/text';
import { HERDR_PATH_EXPORT } from '../hosts/host-path';
import {
  ALPINE_BUSYBOX,
  DEBIAN_NETSTAT,
  DEBIAN_SS,
  DOCKER_PS,
  listeningPort,
  MAC_LSOF,
  MAC_NETSTAT,
  PROBE_TEST_NONCE,
  PROC_TCP,
  PROC_TCP6,
} from './fixtures';
import { buildReport } from './probe';
import {
  lsofNames,
  parseBSDNetstat,
  parseDockerPorts,
  parseLinuxNetstat,
  parseLsof,
  parseProcNetTCP,
  parseSS,
  rawListener,
} from './probe-parse';
import { makeProbeNonce, PROBE_CAP, probeScript } from './probe-script';
import { owned, reportOf, requireRow, row } from './probe-support';
import { bindScope, canOpen, displayName, forwardTarget, isHiddenByDefault } from './types';

describe('probe script', () => {
  const script = probeScript(PROBE_TEST_NONCE);

  it('is fixed, framed and bounded', () => {
    expect(script.startsWith('{\n')).toBe(true);
    expect(script.endsWith('} </dev/null 3>&1\n')).toBe(true);
    expect(script).toContain(`N='__AGENTICO_PORTS_${PROBE_TEST_NONCE}__'`);
    expect(script).toContain(HERDR_PATH_EXPORT);
    expect(script).toContain('PATH="$PATH:/usr/sbin:/sbin"');
    expect(script).toContain('LC_ALL=C');
    for (const command of [
      'sec ss ss -ltnp',
      'sec netstat netstat -ltnpW',
      'sec netstat-np netstat -ltnW',
      'sec proc-tcp cat /proc/net/tcp',
      'sec proc-tcp6 cat /proc/net/tcp6',
      'netstat -anv -p tcp',
      'lsof -nP -iTCP -sTCP:LISTEN -Fpcnt',
      "lim docker ps --format '{{.Names}}|{{.Image}}|{{.Ports}}'",
      `head -c ${PROBE_CAP.section + 1}`,
    ]) {
      expect(script).toContain(command);
    }
    // Never resolves names, never needs a TTY or root.
    expect(script).not.toContain('sudo');
    expect(script).not.toContain('ss -ltnpr');
  });

  it('gives each request its own hex nonce', () => {
    expect(makeProbeNonce()).not.toBe(makeProbeNonce());
    expect(makeProbeNonce()).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('Linux discovery', () => {
  it('names the user processes from ss and keeps the best address', () => {
    const report = reportOf(parseSS(DEBIAN_SS));

    const vite = requireRow(report, 5173);
    expect(vite.processName).toBe('node');
    expect(vite.pid).toBe(1234);
    expect(forwardTarget(vite)).toEqual({ kind: 'loopbackV4', port: 5173 });
    expect(bindScope(vite)).toEqual({ kind: 'loopback' });

    // `0.0.0.0` and `[::]` on one port merge into the IPv4 wildcard.
    const wildcard = requireRow(report, 8080);
    expect(wildcard.address).toBe('0.0.0.0');
    expect(forwardTarget(wildcard)).toEqual({ kind: 'loopbackV4', port: 8080 });
    expect(wildcard.processName).toBeNull();
    expect(renderText(displayName(wildcard))).toBe('port 8080');

    // The first owner of several names the row.
    const node = requireRow(report, 3000);
    expect(node.address).toBe('::1');
    expect(node.pid).toBe(99);
    expect(forwardTarget(node)).toEqual({ kind: 'loopbackV6', port: 3000 });

    const dualStack = requireRow(report, 8000);
    expect(dualStack.address).toBe('0.0.0.0');
    expect(dualStack.processName).toBe('python3');

    const resolver = requireRow(report, 53);
    expect(resolver.address).toBe('127.0.0.53');
    expect(forwardTarget(resolver)).toEqual({
      kind: 'hostAddress',
      address: '127.0.0.53',
      port: 53,
    });
    expect(isHiddenByDefault(resolver)).toBe(true);

    const privateAddress = requireRow(report, 9090);
    expect(forwardTarget(privateAddress)).toEqual({
      kind: 'hostAddress',
      address: '192.168.1.20',
      port: 9090,
    });
    expect(bindScope(privateAddress)).toEqual({ kind: 'address', address: '192.168.1.20' });

    // A public address is listed but has no target: the row is disabled.
    const publicAddress = requireRow(report, 9443);
    expect(forwardTarget(publicAddress)).toBeNull();
    expect(canOpen(publicAddress)).toBe(false);

    expect(isHiddenByDefault(requireRow(report, 22))).toBe(true);
    expect(report.ports).toHaveLength(8);
  });

  it('reads net-tools netstat, including the rewritten program column', () => {
    const listeners = parseLinuxNetstat(DEBIAN_NETSTAT);
    expect(listeners).toHaveLength(4);
    const report = reportOf(listeners);

    const sshd = requireRow(report, 22);
    expect(sshd.processName).toBe('sshd');
    expect(sshd.pid).toBe(612);
    expect(sshd.address).toBe('0.0.0.0');
    expect(isHiddenByDefault(sshd)).toBe(true);
    expect(requireRow(report, 5173).processName).toBe('node');

    // net-tools prints `:::port` for every IPv6 wildcard.
    const v6 = requireRow(report, 4000);
    expect(v6.address).toBe('::');
    expect(v6.processName).toBeNull();
    expect(forwardTarget(v6)).toEqual({ kind: 'loopbackV6', port: 4000 });
  });

  it('parses busybox netstat without ss', () => {
    const report = reportOf(parseLinuxNetstat(ALPINE_BUSYBOX));
    const python = requireRow(report, 8080);
    expect(python.processName).toBe('python3');
    expect(python.pid).toBe(42);
    const postgres = requireRow(report, 5432);
    expect(postgres.processName).toBeNull();
    expect(forwardTarget(postgres)).toEqual({ kind: 'loopbackV4', port: 5432 });
    expect(forwardTarget(requireRow(report, 6379))).toEqual({ kind: 'loopbackV6', port: 6379 });
    // IPv4-mapped IPv6 reads as IPv4, which the SSH layer accepts.
    const mapped = requireRow(report, 9229);
    expect(mapped.address).toBe('127.0.0.1');
    expect(mapped.processName).toBe('node');
  });

  it('decodes /proc/net/tcp little-endian addresses and skips other states', () => {
    const v4 = parseProcNetTCP(PROC_TCP);
    expect(v4).toEqual([
      rawListener(8080, '127.0.0.1'),
      rawListener(22, '0.0.0.0'),
      rawListener(9090, '192.168.1.20'),
    ]);
    const v6 = parseProcNetTCP(PROC_TCP6);
    expect(v6).toEqual([
      rawListener(3000, '::1'),
      rawListener(22, '::'),
      rawListener(9000, '127.0.0.1'),
    ]);
    const report = reportOf([...v4, ...v6]);
    expect(requireRow(report, 22).address).toBe('0.0.0.0');
    expect(report.ports.every((candidate) => candidate.processName === null)).toBe(true);
  });
});

describe('macOS discovery', () => {
  it('finds names by pattern and lets lsof complete them', () => {
    const listeners = parseBSDNetstat(MAC_NETSTAT);
    expect(listeners).toHaveLength(5);
    const chrome = listeners.find((candidate) => candidate.port === 9222);
    expect(chrome?.processName).toBe('Google Chrome');
    expect(chrome?.pid).toBe(9570);

    const report = buildReport({
      listeners: [...listeners, ...parseLsof(MAC_LSOF)],
      docker: [],
      namesByPID: lsofNames(MAC_LSOF),
      readContainers: false,
    });

    // lsof's full name replaces netstat's 16-character one.
    const logi = requireRow(report, 49374);
    expect(logi.processName).toBe('LogiPluginService');
    expect(logi.pid).toBe(1980);

    const controlCenter = requireRow(report, 7000);
    expect(controlCenter.address).toBe('0.0.0.0');
    expect(forwardTarget(controlCenter)).toEqual({ kind: 'loopbackV4', port: 7000 });

    // A v6-only wildcard (`tcp6 *.5000`) leads to `::1`.
    const python = requireRow(report, 5000);
    expect(python.address).toBe('::');
    expect(forwardTarget(python)).toEqual({ kind: 'loopbackV6', port: 5000 });
    expect(python.processName).toBe('python3.12');

    const cups = requireRow(report, 631);
    expect(cups.address).toBe('::1');
    expect(isHiddenByDefault(cups)).toBe(true);
  });

  it('lists the user servers from lsof alone', () => {
    expect(parseLsof(MAC_LSOF)).toEqual([
      owned(49374, '127.0.0.1', 1980, 'LogiPluginService'),
      owned(5000, '::', 4242, 'python3.12'),
      owned(9222, '127.0.0.1', 9570, 'Google Chrome'),
    ]);
  });
});

describe('Docker', () => {
  it('merges IPv6 duplicates and expands ranges', () => {
    const mappings = parseDockerPorts(DOCKER_PS);
    expect(mappings.map((mapping) => mapping.hostPort)).toEqual([
      8080, 8080, 8000, 8001, 8000, 8001, 3001,
    ]);
    expect(mappings[0]?.containerName).toBe('vaultwarden');
    expect(mappings[0]?.image).toBe('vaultwarden/server:latest');
    expect(mappings[1]?.hostAddress).toBe('::');
    expect(mappings[4]?.hostAddress).toBe('::');
    expect(mappings.at(-1)?.hostAddress).toBe('127.0.0.1');
  });

  it('names container ports and gives a port without a socket its own row', () => {
    const ss = `State  Recv-Q Send-Q Local Address:Port  Peer Address:PortProcess
LISTEN 0      4096         0.0.0.0:8080       0.0.0.0:*
LISTEN 0      4096            [::]:8080          [::]:*
LISTEN 0      511        127.0.0.1:5173       0.0.0.0:*    users:(("node",pid=1234,fd=20))`;
    const report = reportOf(parseSS(ss), parseDockerPorts(DOCKER_PS), true);

    const vaultwarden = requireRow(report, 8080);
    expect(vaultwarden.containerName).toBe('vaultwarden');
    expect(renderText(displayName(vaultwarden))).toBe('vaultwarden');
    expect(forwardTarget(vaultwarden)).toEqual({ kind: 'loopbackV4', port: 8080 });

    // Userland proxy off: only `docker ps` knows these.
    expect(requireRow(report, 8000).containerName).toBe('web');
    expect(forwardTarget(requireRow(report, 8001))).toEqual({ kind: 'loopbackV4', port: 8001 });
    const local = requireRow(report, 3001);
    expect(local.address).toBe('127.0.0.1');
    expect(local.image).toBe('app:dev');

    // Exposed-only and UDP ports have no Host socket.
    expect(row(report, 5432)).toBeUndefined();
    expect(row(report, 53)).toBeUndefined();

    // Containers first, then likely web servers, then by port.
    expect(report.ports.map((candidate) => candidate.port)).toEqual([3001, 8000, 8001, 8080, 5173]);
    expect(report.readContainers).toBe(true);
  });

  it('labels a bare docker-proxy as a container', () => {
    const proxy = listeningPort(9000, '0.0.0.0', { pid: 812, processName: 'docker-proxy' });
    expect(renderText(displayName(proxy))).toBe('container');
  });
});
