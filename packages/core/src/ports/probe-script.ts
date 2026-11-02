import { HERDR_PATH_EXPORT } from '../hosts/host-path';

/** The caller's wait: the whole script inside 8 s. */
export const PROBE_DEADLINE_MS = 8_000;
/** The bound on `docker ps`, which waits on a daemon that may hang. */
export const DOCKER_SECONDS = 4;

export const PROBE_CAP = {
  /** Bytes kept from one tool's output, one over so a cut shows. */
  section: 262_144,
  /** Rows a report holds. */
  listeners: 200,
  /** Characters kept from a process, container or image name. */
  name: 128,
  /** Ports one Docker range may expand to. */
  dockerRange: 64,
} as const;

export const PROBE_SHELL_INVOCATION = '/bin/sh -s';

/** A fresh 32-hex nonce per request, so a process or container name cannot pass for a marker. */
export function makeProbeNonce(random: () => number = Math.random): string {
  let out = '';
  for (let index = 0; index < 32; index++) out += Math.floor(random() * 16).toString(16);
  return out;
}

export function probeMarker(nonce: string): string {
  return `__AGENTICO_PORTS_${nonce}__`;
}

/**
 * The POSIX shell script that lists a Host's listening TCP servers. One fixed script for every
 * Host, run over the bounded exec path: it travels on standard input, nothing the user typed is
 * spliced into it, and each tool's output sits between markers carrying the request's nonce.
 * Linux tries `ss`, then `netstat` (net-tools or busybox), then `/proc/net/tcp`; macOS reads
 * `netstat -anv` and `lsof`; `docker ps` maps published ports to containers when readable.
 * Every tool runs without root and without name resolution.
 *
 * `sbin` is appended because Debian gives non-root SSH logins a PATH without it. `lim` bounds
 * `docker ps` without `timeout`, which macOS lacks; its timer also ends the command's children,
 * and runs with every descriptor on the null device so it never holds the SSH channel open.
 */
export function probeScript(nonce: string): string {
  return `{
N='${probeMarker(nonce)}'
LC_ALL=C
export LC_ALL
${HERDR_PATH_EXPORT}
PATH="$PATH:/usr/sbin:/sbin"
export PATH
has() { command -v "$1" >/dev/null 2>&1; }
sec() {
  name=$1; shift
  printf '\\n%s %s begin\\n' "$N" "$name"
  rc=$( { { "$@" 2>/dev/null; echo "$?" >&4; } | head -c ${PROBE_CAP.section + 1} >&3; } 4>&1 )
  printf '\\n%s %s rc=%s\\n' "$N" "$name" "$rc"
}
lim() {
  "$@" &
  lp=$!
  ( sleep ${DOCKER_SECONDS}; has pkill && pkill -P "$lp"; kill "$lp" ) </dev/null >/dev/null 2>&1 &
  lw=$!
  wait "$lp"
  lr=$?
  kill "$lw" 2>/dev/null
  return "$lr"
}
bsd_netstat() { netstat -anv -p tcp | grep -E '^Proto|LISTEN'; }
os=$(uname -s 2>/dev/null)
printf '\\n%s os %s\\n' "$N" "$os"
case $os in
Linux)
  rc=1
  has ss && sec ss ss -ltnp
  if [ "$rc" != 0 ] && has netstat; then
    sec netstat netstat -ltnpW
    [ "$rc" = 0 ] || sec netstat-np netstat -ltnW
  fi
  if [ "$rc" != 0 ]; then
    sec proc-tcp cat /proc/net/tcp
    sec proc-tcp6 cat /proc/net/tcp6
  fi
  ;;
Darwin)
  sec bsd-netstat bsd_netstat
  has lsof && sec lsof lsof -nP -iTCP -sTCP:LISTEN -Fpcnt
  ;;
esac
has docker && sec docker lim docker ps --format '{{.Names}}|{{.Image}}|{{.Ports}}'
printf '\\n%s done\\n' "$N"
} </dev/null 3>&1
`;
}
