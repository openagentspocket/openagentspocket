import type { ShellExec } from '../changes/exec';
import { message } from '../errors/text';
import { TransportFailure } from '../errors/transport-error';
import { encodeUtf8 } from '../events/utf8';
import { CancelledError, type CancelSignal } from '../hosts/cancellation';
import {
  type DockerMapping,
  lsofNames,
  parseBSDNetstat,
  parseDockerPorts,
  parseLinuxNetstat,
  parseLsof,
  parseProcNetTCP,
  parseSS,
  type RawListener,
} from './probe-parse';
import {
  makeProbeNonce,
  PROBE_CAP,
  PROBE_DEADLINE_MS,
  PROBE_SHELL_INVOCATION,
  probeMarker,
  probeScript,
} from './probe-script';
import {
  forwardTargetFor,
  isHiddenByDefault,
  isLikelyHTTP,
  type ListeningPort,
  type ListeningPortReport,
} from './types';

const LISTENER_SECTIONS = [
  'ss',
  'netstat',
  'netstat-np',
  'proc-tcp',
  'proc-tcp6',
  'bsd-netstat',
  'lsof',
] as const;

function parseListeners(section: string, text: string): RawListener[] {
  switch (section) {
    case 'ss':
      return parseSS(text);
    case 'netstat':
    case 'netstat-np':
      return parseLinuxNetstat(text);
    case 'proc-tcp':
    case 'proc-tcp6':
      return parseProcNetTCP(text);
    case 'bsd-netstat':
      return parseBSDNetstat(text);
    case 'lsof':
      return parseLsof(text);
    default:
      return [];
  }
}

export interface ProbeSection {
  readonly text: string;
  /** Null when the script ended before the section's status. */
  readonly status: number | null;
}

/** One tool's output between its markers; a section the watchdog cut short still yields its text. */
export function probeSection(name: string, stdout: string, marker: string): ProbeSection | null {
  const beginMarker = `\n${marker} ${name} begin\n`;
  const begin = stdout.indexOf(beginMarker);
  if (begin < 0) return null;
  const bodyStart = begin + beginMarker.length;
  const statusMarker = `\n${marker} ${name} rc=`;
  const end = stdout.indexOf(statusMarker, bodyStart);
  let body: string;
  let status: number | null = null;
  if (end >= 0) {
    body = stdout.slice(bodyStart, end);
    const statusStart = end + statusMarker.length;
    const lineEnd = stdout.indexOf('\n', statusStart);
    const statusText = stdout.slice(statusStart, lineEnd < 0 ? stdout.length : lineEnd);
    status = /^-?[0-9]+$/.test(statusText) ? Number(statusText) : null;
  } else {
    const next = stdout.indexOf(`\n${marker} `, bodyStart);
    body = stdout.slice(bodyStart, next < 0 ? stdout.length : next);
  }
  if (body.length > PROBE_CAP.section) {
    // Cut mid-line: drop the partial last line.
    body = body.slice(0, PROBE_CAP.section);
    const lastNewline = body.lastIndexOf('\n');
    if (lastNewline >= 0) body = body.slice(0, lastNewline);
  }
  return { text: body, status };
}

/** Lower is more reachable: the wildcard, then each loopback, then a private address, then none. */
function rank(address: string): number {
  switch (address) {
    case '0.0.0.0':
      return 0;
    case '127.0.0.1':
      return 1;
    case '::':
      return 2;
    case '::1':
      return 3;
    default:
      return forwardTargetFor(address, 1) === null ? 5 : 4;
  }
}

function displayOrder(lhs: ListeningPort, rhs: ListeningPort): number {
  const hidden = Number(isHiddenByDefault(lhs)) - Number(isHiddenByDefault(rhs));
  if (hidden !== 0) return hidden;
  const container = Number(rhs.containerName !== null) - Number(lhs.containerName !== null);
  if (container !== 0) return container;
  const http = Number(isLikelyHTTP(rhs)) - Number(isLikelyHTTP(lhs));
  if (http !== 0) return http;
  return lhs.port - rhs.port;
}

/**
 * One row per port: the most reachable address of its sockets, the first process name seen
 * (lsof's full one on macOS), and the container publishing it. A published port with no socket
 * (Docker's userland proxy off) still gets its row from `docker ps`.
 */
export function buildReport(input: {
  listeners: readonly RawListener[];
  docker: readonly DockerMapping[];
  namesByPID?: ReadonlyMap<number, string>;
  readContainers: boolean;
}): ListeningPortReport {
  const sockets = new Map<number, RawListener[]>();
  for (const listener of input.listeners) {
    sockets.set(listener.port, [...(sockets.get(listener.port) ?? []), listener]);
  }
  const listened = new Set(sockets.keys());
  const containers = new Map<number, DockerMapping>();
  for (const mapping of input.docker) {
    if (!containers.has(mapping.hostPort)) containers.set(mapping.hostPort, mapping);
    // Each published address stands in for the socket nobody listed.
    if (!listened.has(mapping.hostPort)) {
      const stand: RawListener = {
        port: mapping.hostPort,
        address: mapping.hostAddress,
        pid: null,
        processName: null,
      };
      sockets.set(mapping.hostPort, [...(sockets.get(mapping.hostPort) ?? []), stand]);
    }
  }
  const rows: ListeningPort[] = [];
  for (const [port, group] of sockets) {
    let best = group[0];
    for (const candidate of group) {
      if (best && rank(candidate.address) < rank(best.address)) best = candidate;
    }
    if (!best) continue;
    const owner = best.processName !== null ? best : group.find((l) => l.processName !== null);
    const pid = owner?.pid ?? best.pid;
    const processName =
      (pid !== null ? input.namesByPID?.get(pid) : undefined) ?? owner?.processName ?? null;
    const container = containers.get(port);
    rows.push({
      port,
      address: best.address,
      pid,
      processName,
      containerName: container?.containerName ?? null,
      image: container?.image ?? null,
    });
  }
  rows.sort(displayOrder);
  return {
    ports: rows.slice(0, PROBE_CAP.listeners),
    isTruncated: rows.length > PROBE_CAP.listeners,
    readContainers: input.readContainers,
  };
}

/**
 * The script's output through one request's nonce. Only the `os` line is required; a system
 * the script does not know yields an empty list.
 */
export function parseProbeOutput(stdout: string, nonce: string): ListeningPortReport {
  const marker = probeMarker(nonce);
  if (!stdout.includes(`\n${marker} os `)) {
    throw new TransportFailure({
      kind: 'malformedResponse',
      detail: message('the port list arrived without its markers'),
    });
  }
  let listeners: RawListener[] = [];
  for (const name of LISTENER_SECTIONS) {
    const section = probeSection(name, stdout, marker);
    if (section) listeners = [...listeners, ...parseListeners(name, section.text)];
  }
  const docker = probeSection('docker', stdout, marker);
  const lsof = probeSection('lsof', stdout, marker);
  return buildReport({
    listeners,
    docker: docker ? parseDockerPorts(docker.text) : [],
    namesByPID: lsof ? lsofNames(lsof.text) : new Map(),
    readContainers: docker?.status === 0,
  });
}

function failureCode(thrown: unknown): string | null {
  if (typeof thrown === 'object' && thrown !== null && 'code' in thrown) {
    const { code } = thrown as { code: unknown };
    return typeof code === 'string' ? code : null;
  }
  return null;
}

/** One port discovery: one script, one bounded exec, a fresh nonce per request. */
export async function listListeningPorts(
  exec: ShellExec,
  options: { signal?: CancelSignal; deadlineMs?: number; nonce?: () => string } = {},
): Promise<ListeningPortReport> {
  const nonce = (options.nonce ?? makeProbeNonce)();
  if (options.signal?.aborted) throw new CancelledError();
  let stdout: string;
  try {
    const result = await exec(PROBE_SHELL_INVOCATION, {
      input: encodeUtf8(probeScript(nonce)),
      timeoutMs: options.deadlineMs ?? PROBE_DEADLINE_MS,
    });
    stdout = result.stdout;
  } catch (thrown) {
    if (thrown instanceof CancelledError || thrown instanceof TransportFailure) throw thrown;
    const code = failureCode(thrown);
    if (code === 'timedOut') throw new TransportFailure({ kind: 'timedOut' });
    if (code === 'cancelled') throw new TransportFailure({ kind: 'cancelled' });
    throw thrown;
  }
  if (options.signal?.aborted) throw new CancelledError();
  return parseProbeOutput(stdout, nonce);
}
