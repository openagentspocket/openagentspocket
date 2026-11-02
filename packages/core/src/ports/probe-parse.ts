import { normalizedAddress, numericText, parsePort, splitHostPort } from './address';
import { PROBE_CAP } from './probe-script';

/** One listening socket as one tool printed it. */
export interface RawListener {
  readonly port: number;
  readonly address: string;
  readonly pid: number | null;
  readonly processName: string | null;
}

/** One published port from `docker ps`. */
export interface DockerMapping {
  readonly hostPort: number;
  readonly hostAddress: string;
  readonly containerName: string;
  readonly image: string;
}

function raw(
  port: number,
  address: string,
  pid: number | null = null,
  processName: string | null = null,
): RawListener {
  return { port, address: normalizedAddress(address), pid, processName };
}

/** Test and merge helper: a listener with no owner. */
export function rawListener(port: number, address: string): RawListener {
  return raw(port, address);
}

function lines(text: string): string[] {
  return text.split(/\r\n|[\n\r\v\f\u0085\u2028\u2029]/).filter((line) => line !== '');
}

function words(line: string): string[] {
  return line.split(/\s+/).filter((word) => word !== '');
}

function wholeNumber(text: string): number | null {
  return /^[0-9]+$/.test(text) ? Number(text) : null;
}

/**
 * Host-supplied names are shown as plain text: control characters are dropped, the ends trimmed
 * and the length capped. `-` (another user's process) and an empty name read as no name.
 */
export function cleanName(text: string): string | null {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
  const name = text.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
  if (name === '' || name === '-') return null;
  return Array.from(name).slice(0, PROBE_CAP.name).join('');
}

/**
 * `ss -ltnp`, any iproute2 version: the header is skipped by content, the local address is the
 * third column after the state, and the first owner in `users:(("name",pid=N,fd=N),...)` names
 * the process.
 */
export function parseSS(text: string): RawListener[] {
  const out: RawListener[] = [];
  for (const line of lines(text)) {
    const tokens = words(line);
    const state = tokens.indexOf('LISTEN');
    if (state < 0 || tokens.length <= state + 3) continue;
    const local = splitHostPort(tokens[state + 3] ?? '');
    if (!local) continue;
    let pid: number | null = null;
    let processName: string | null = null;
    const owner = line.indexOf('users:(("');
    if (owner >= 0) {
      const rest = line.slice(owner + 'users:(("'.length);
      const nameEnd = rest.indexOf('",');
      if (nameEnd >= 0) {
        processName = cleanName(rest.slice(0, nameEnd));
        const pidAt = rest.indexOf('pid=', nameEnd + 2);
        if (pidAt >= 0) pid = wholeNumber(/^[0-9]*/.exec(rest.slice(pidAt + 4))?.[0] ?? '');
      }
    }
    out.push(raw(local.port, local.host, pid, processName));
  }
  return out;
}

/**
 * net-tools and busybox `netstat -ltn[p]W`: `Proto Recv-Q Send-Q Local Foreign State
 * [PID/Program]`, where the program is `-` for another user's process and net-tools prints a
 * rewritten argv such as `sshd: /usr/sbin`.
 */
export function parseLinuxNetstat(text: string): RawListener[] {
  const out: RawListener[] = [];
  for (const line of lines(text)) {
    const tokens = words(line);
    if (tokens.length < 6 || !tokens[0]?.startsWith('tcp') || tokens[5] !== 'LISTEN') continue;
    const local = splitHostPort(tokens[3] ?? '');
    if (!local) continue;
    let pid: number | null = null;
    let processName: string | null = null;
    if (tokens.length > 6) {
      const program = tokens.slice(6).join(' ');
      const slash = program.indexOf('/');
      if (slash >= 0) {
        pid = wholeNumber(program.slice(0, slash));
        let name = program.slice(slash + 1);
        const colon = name.indexOf(':');
        if (colon >= 0) name = name.slice(0, colon);
        processName = cleanName(name);
      }
    }
    out.push(raw(local.port, local.host, pid, processName));
  }
  return out;
}

function procAddress(hex: string): string | null {
  if (!/^[0-9a-fA-F]+$/.test(hex) || (hex.length !== 8 && hex.length !== 32)) return null;
  const bytes: number[] = [];
  for (let index = 0; index < hex.length; index += 8) {
    const word = Number.parseInt(hex.slice(index, index + 8), 16);
    // Network-order words printed in host order (little-endian on every Host this app meets).
    bytes.push(word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, (word >>> 24) & 0xff);
  }
  return numericText(bytes);
}

/**
 * `/proc/net/tcp` and `/proc/net/tcp6`: state `0A` is LISTEN; the port is host order. No process
 * names: the inode-to-pid walk is skipped.
 */
export function parseProcNetTCP(text: string): RawListener[] {
  const out: RawListener[] = [];
  for (const line of lines(text)) {
    const tokens = words(line);
    if (tokens.length <= 3 || tokens[3] !== '0A') continue;
    const local = (tokens[1] ?? '').split(':');
    if (local.length !== 2 || !/^[0-9a-fA-F]{1,4}$/.test(local[1] ?? '')) continue;
    const port = Number.parseInt(local[1] ?? '', 16);
    const address = procAddress(local[0] ?? '');
    if (port > 0 && address !== null) out.push(raw(port, address));
  }
  return out;
}

/**
 * Skips the byte and buffer counters, then gathers words up to the first `word:digits`. Older
 * layouts print numeric `pid epid` columns instead and yield null.
 */
function bsdProcess(tokens: readonly string[]): { name: string; pid: number } | null {
  let index = 0;
  while (index < tokens.length && /^[0-9]+$/.test(tokens[index] ?? '')) index++;
  const gathered: string[] = [];
  while (index < tokens.length && gathered.length < 8) {
    const token = tokens[index] ?? '';
    const colon = token.lastIndexOf(':');
    const pid = colon >= 0 ? wholeNumber(token.slice(colon + 1)) : null;
    if (pid !== null) {
      gathered.push(token.slice(0, colon));
      const name = cleanName(gathered.join(' '));
      return name === null ? null : { name, pid };
    }
    gathered.push(token);
    index++;
  }
  return null;
}

/**
 * `netstat -anv -p tcp` on macOS: `tcp4`/`tcp6`/`tcp46`, addresses with a dot before the port
 * (`127.0.0.1.49374`, `*.7000`, `::1.631`), and a `name:pid` column found by pattern, since names
 * hold spaces (`Google Chrome:9570`) and are cut at 16 characters.
 */
export function parseBSDNetstat(text: string): RawListener[] {
  const out: RawListener[] = [];
  for (const line of lines(text)) {
    const tokens = words(line);
    const state = tokens.indexOf('LISTEN');
    if (tokens.length < 4 || !tokens[0]?.startsWith('tcp') || state < 0) continue;
    const local = tokens[3] ?? '';
    const dot = local.lastIndexOf('.');
    if (dot < 0) continue;
    const port = parsePort(local.slice(dot + 1));
    if (port === null) continue;
    let address = local.slice(0, dot);
    if (address === '*') address = tokens[0] === 'tcp6' ? '::' : '0.0.0.0';
    const owner = bsdProcess(tokens.slice(state + 1));
    out.push(raw(port, address, owner?.pid ?? null, owner?.name ?? null));
  }
  return out;
}

/**
 * `lsof -nP -iTCP -sTCP:LISTEN -Fpcnt`: `p<pid>` opens a process, `c<command>` names it in full,
 * and each file's `t<IPv4|IPv6>` precedes its `n<address>:<port>`. Only the user's own processes.
 */
export function parseLsof(text: string): RawListener[] {
  const out: RawListener[] = [];
  let pid: number | null = null;
  let command: string | null = null;
  let isIPv6 = false;
  for (const line of lines(text)) {
    const value = line.slice(1);
    switch (line[0]) {
      case 'p':
        pid = wholeNumber(value);
        command = null;
        break;
      case 'c':
        command = cleanName(value);
        break;
      case 'f':
        isIPv6 = false;
        break;
      case 't':
        isIPv6 = value === 'IPv6';
        break;
      case 'n': {
        const local = splitHostPort(value);
        if (!local) break;
        const address = local.host === '*' ? (isIPv6 ? '::' : '0.0.0.0') : local.host;
        out.push(raw(local.port, address, pid, command));
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** lsof's untruncated command names by pid, to replace netstat's 16-character ones. */
export function lsofNames(text: string): Map<number, string> {
  const names = new Map<number, string>();
  for (const listener of parseLsof(text)) {
    if (listener.pid !== null && listener.processName !== null) {
      names.set(listener.pid, listener.processName);
    }
  }
  return names;
}

function portRange(text: string): number[] {
  const bounds = text.split('-');
  const first = parsePort(bounds[0] ?? '');
  if (first === null) return [];
  const last = bounds.length === 2 ? parsePort(bounds[1] ?? '') : null;
  if (bounds.length !== 2 || last === null || last < first)
    return bounds.length === 1 ? [first] : [];
  const upper = Math.min(last, first + PROBE_CAP.dockerRange - 1);
  return Array.from({ length: upper - first + 1 }, (_, offset) => first + offset);
}

/**
 * `docker ps --format '{{.Names}}|{{.Image}}|{{.Ports}}'`. Host mappings read
 * `0.0.0.0:8080->80/tcp, [::]:8080->80/tcp` (older CLIs `:::8080`); consecutive ports group into
 * ranges; exposed-only ports (`9988/tcp`) and UDP have no Host socket and are skipped.
 */
export function parseDockerPorts(text: string): DockerMapping[] {
  const mappings: DockerMapping[] = [];
  for (const line of lines(text)) {
    const first = line.indexOf('|');
    const second = first < 0 ? -1 : line.indexOf('|', first + 1);
    if (second < 0) continue;
    const containerName = cleanName(line.slice(0, first));
    if (containerName === null) continue;
    const image = cleanName(line.slice(first + 1, second)) ?? '';
    for (const rawEntry of line.slice(second + 1).split(',')) {
      const entry = rawEntry.trim();
      const arrow = entry.indexOf('->');
      if (arrow < 0 || !entry.endsWith('/tcp')) continue;
      const colon = entry.slice(0, arrow).lastIndexOf(':');
      if (colon < 0) continue;
      let host = entry.slice(0, colon);
      if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
      const hostAddress = normalizedAddress(host === '' ? '0.0.0.0' : host);
      for (const hostPort of portRange(entry.slice(colon + 1, arrow))) {
        mappings.push({ hostPort, hostAddress, containerName, image });
      }
    }
  }
  return mappings;
}
