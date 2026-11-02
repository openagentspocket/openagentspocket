import { describe, expect, it } from 'vitest';
import { TransportFailure } from '../errors/transport-error';
import { normalizedAddress } from './address';
import {
  ALPINE_BUSYBOX,
  DEBIAN_SS,
  DOCKER_PS,
  MAC_LSOF,
  MAC_NETSTAT,
  PROBE_TEST_NONCE,
  PROC_TCP,
  PROC_TCP6,
  probeOutput,
} from './fixtures';
import { listListeningPorts, parseProbeOutput } from './probe';
import { parseDockerPorts, parseSS, rawListener } from './probe-parse';
import { PROBE_CAP } from './probe-script';
import { reportOf, requireRow, row } from './probe-support';
import { forwardTarget, forwardTargetFor } from './types';

describe('framing', () => {
  const parse = (stdout: string) => parseProbeOutput(stdout, PROBE_TEST_NONCE);

  it('parses every section of a full Linux run under its nonce', () => {
    const report = parse(
      probeOutput('Linux', [
        ['ss', DEBIAN_SS, 0],
        ['docker', DOCKER_PS, 0],
      ]),
    );
    expect(report.readContainers).toBe(true);
    expect(requireRow(report, 8080).containerName).toBe('vaultwarden');
    expect(requireRow(report, 5173).processName).toBe('node');
    expect(report.isTruncated).toBe(false);
  });

  it('parses the fallback sections when ss is missing', () => {
    const netstat = parse(
      probeOutput('Linux', [
        ['netstat', '', 1],
        ['netstat-np', ALPINE_BUSYBOX, 0],
      ]),
    );
    expect(row(netstat, 8080)).toBeDefined();
    expect(netstat.readContainers).toBe(false);

    const proc = parse(
      probeOutput('Linux', [
        ['proc-tcp', PROC_TCP, 0],
        ['proc-tcp6', PROC_TCP6, 0],
      ]),
    );
    expect(proc.ports.map((candidate) => candidate.port).sort((a, b) => a - b)).toEqual([
      22, 3000, 8080, 9000, 9090,
    ]);
  });

  it('uses netstat and lsof on macOS, and a stopped Docker daemon is no error', () => {
    const report = parse(
      probeOutput('Darwin', [
        ['bsd-netstat', MAC_NETSTAT, 0],
        ['lsof', MAC_LSOF, 0],
        ['docker', '', 1],
      ]),
    );
    expect(requireRow(report, 49374).processName).toBe('LogiPluginService');
    expect(report.ports).toHaveLength(5);
    expect(report.readContainers).toBe(false);
  });

  it('still counts a section the watchdog cut short', () => {
    const report = parse(
      probeOutput(
        'Linux',
        [
          ['ss', DEBIAN_SS, 0],
          ['docker', 'vault|img|0.0.0.0:', null],
        ],
        { done: false },
      ),
    );
    expect(row(report, 5173)).toBeDefined();
    expect(report.readContainers).toBe(false);
  });

  it('ignores output under another nonce and tolerates an unknown system', () => {
    const stale = probeOutput('Linux', [['ss', DEBIAN_SS, 0]], {
      nonce: 'ffffffffffffffffffffffffffffffff',
    });
    expect(() => parse(stale)).toThrow(TransportFailure);
    try {
      parse(stale);
    } catch (thrown) {
      expect((thrown as TransportFailure).error.kind).toBe('malformedResponse');
    }
    expect(parse(probeOutput('FreeBSD', [])).ports).toEqual([]);
  });
});

describe('caps and hostile output', () => {
  it('holds at most two hundred rows', () => {
    const listeners = Array.from({ length: 300 }, (_, index) =>
      rawListener(2000 + index, '127.0.0.1'),
    );
    const report = reportOf(listeners);
    expect(report.ports).toHaveLength(PROBE_CAP.listeners);
    expect(report.isTruncated).toBe(true);
  });

  it('shows host names as plain, capped text and never targets a hostname', () => {
    const long = 'x'.repeat(5000);
    const ss = [
      'LISTEN 0 5 127.0.0.1:7001 0.0.0.0:* users:(("evil\u001b[2Jname",pid=5,fd=3))',
      `LISTEN 0 5 127.0.0.1:7002 0.0.0.0:* users:(("${long}",pid=6,fd=3))`,
      'LISTEN 0 5 example.com:7003 0.0.0.0:*',
      'LISTEN 0 5 127.0.0.1:0 0.0.0.0:*',
      'LISTEN 0 5 127.0.0.1:99999 0.0.0.0:*',
    ].join('\n');
    const report = reportOf(
      parseSS(ss),
      parseDockerPorts('a|b|0.0.0.0:1-65535->1-65535/tcp'),
      true,
    );
    expect(requireRow(report, 7001).processName).toBe('evil[2Jname');
    expect(requireRow(report, 7002).processName).toHaveLength(PROBE_CAP.name);
    expect(forwardTarget(requireRow(report, 7003))).toBeNull();
    // A range expands to at most `dockerRange` ports.
    expect(report.ports.filter((candidate) => candidate.containerName === 'a')).toHaveLength(
      PROBE_CAP.dockerRange,
    );
  });

  it('normalises addresses before they are checked', () => {
    expect(normalizedAddress('*')).toBe('0.0.0.0');
    expect(normalizedAddress('127.0.0.53%lo')).toBe('127.0.0.53');
    expect(normalizedAddress('::FFFF:10.0.0.2')).toBe('10.0.0.2');
    expect(normalizedAddress('0:0:0:0:0:0:0:1')).toBe('::1');
    // An IPv6 scope stays, so the SSH layer refuses it.
    expect(normalizedAddress('fe80::1%eth0')).toBe('fe80::1%eth0');
    expect(forwardTargetFor('fe80::1%eth0', 80)).toBeNull();
    expect(forwardTargetFor('fd00::5', 80)).toEqual({
      kind: 'hostAddress',
      address: 'fd00::5',
      port: 80,
    });
    expect(forwardTargetFor('8.8.8.8', 80)).toBeNull();
    expect(forwardTargetFor('0.0.0.0', 0)).toBeNull();
    expect(forwardTargetFor('::ffff:10.0.0.2', 80)).toBeNull();
    expect(forwardTargetFor('172.32.0.1', 80)).toBeNull();
    expect(forwardTargetFor('172.31.0.1', 80)).not.toBeNull();
  });
});

describe('listListeningPorts', () => {
  it('runs the framed script once on stdin and parses its reply', async () => {
    const calls: { command: string; input: Uint8Array; timeoutMs: number }[] = [];
    const report = await listListeningPorts(
      async (command, options) => {
        calls.push({ command, ...options });
        const text = new TextDecoder().decode(options.input);
        const nonce = /__AGENTICO_PORTS_([0-9a-f]+)__/.exec(text)?.[1] ?? '';
        return {
          exitCode: 0,
          stdout: probeOutput('Linux', [['ss', DEBIAN_SS, 0]], { nonce }),
          stderr: '',
        };
      },
      { deadlineMs: 1234 },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe('/bin/sh -s');
    expect(calls[0]?.timeoutMs).toBe(1234);
    expect(row(report, 5173)).toBeDefined();
  });

  it('maps an SSH timeout to the transport timeout', async () => {
    const timeout = Object.assign(new Error('timed out'), { code: 'timedOut' });
    await expect(
      listListeningPorts(async () => {
        throw timeout;
      }),
    ).rejects.toMatchObject({ error: { kind: 'timedOut' } });
  });
});
