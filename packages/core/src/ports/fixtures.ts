import { probeMarker } from './probe-script';
import type { ListeningPort, ListeningPortReport } from './types';

/** Tool outputs shaped like the Hosts the Swift app's tests used (test and demo support). */

/** iproute2 6.x as a non-root user: `*` is a dual-stack socket, `[::]` a v6-only one. */
export const DEBIAN_SS = `State  Recv-Q Send-Q Local Address:Port  Peer Address:PortProcess
LISTEN 0      4096   127.0.0.53%lo:53         0.0.0.0:*
LISTEN 0      128          0.0.0.0:22         0.0.0.0:*
LISTEN 0      511        127.0.0.1:5173       0.0.0.0:*    users:(("node",pid=1234,fd=20))
LISTEN 0      4096         0.0.0.0:8080       0.0.0.0:*
LISTEN 0      4096            [::]:8080          [::]:*
LISTEN 0      128             [::]:22            [::]:*
LISTEN 0      511            [::1]:3000          [::]:*    users:(("node",pid=99,fd=19),("node",pid=100,fd=19))
LISTEN 0      5                  *:8000             *:*    users:(("python3",pid=181,fd=3))
LISTEN 0      4096    192.168.1.20:9090       0.0.0.0:*
LISTEN 0      4096     203.0.113.7:9443       0.0.0.0:*
`;

/** net-tools with `-p` as a non-root user: the program column is a rewritten argv or `-`. */
export const DEBIAN_NETSTAT = `Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      612/sshd: /usr/sbin
tcp        0      0 127.0.0.1:5173          0.0.0.0:*               LISTEN      1234/node
tcp6       0      0 :::22                   :::*                    LISTEN      612/sshd: /usr/sbin
tcp6       0      0 :::4000                 :::*                    LISTEN      -
`;

/** busybox `netstat -ltnpW` on Alpine as a non-root user. */
export const ALPINE_BUSYBOX = `Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 0.0.0.0:8080            0.0.0.0:*               LISTEN      42/python3
tcp        0      0 127.0.0.1:5432          0.0.0.0:*               LISTEN      -
tcp        0      0 :::22                   :::*                    LISTEN      -
tcp        0      0 ::1:6379                :::*                    LISTEN      -
tcp        0      0 ::ffff:127.0.0.1:9229   :::*                    LISTEN      77/node
`;

/** `/proc/net/tcp`: 127.0.0.1:8080, 0.0.0.0:22, an established socket, and 192.168.1.20:9090. */
export const PROC_TCP = `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 0100007F:1F90 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 31337 1 0000000000000000 100 0 0 10 0
   1: 00000000:0016 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 12345 1 0000000000000000 100 0 0 10 0
   2: 0100007F:1F90 0100007F:D431 01 00000000:00000000 00:00000000 00000000  1000        0 31338 1 0000000000000000 20 4 30 10 -1
   3: 1401A8C0:2382 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 31339 1 0000000000000000 100 0 0 10 0
`;

/** `/proc/net/tcp6`: ::1:3000, :::22 and ::ffff:127.0.0.1:9000. */
export const PROC_TCP6 = `  sl  local_address                         remote_address                        st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 00000000000000000000000001000000:0BB8 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 4242 1 0000000000000000 100 0 0 10 0
   1: 00000000000000000000000000000000:0016 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 4243 1 0000000000000000 100 0 0 10 0
   2: 0000000000000000FFFF00000100007F:2328 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 4244 1 0000000000000000 100 0 0 10 0
`;

/** macOS `netstat -anv -p tcp | grep -E '^Proto|LISTEN'`: names with spaces, cut at 16 characters. */
export const MAC_NETSTAT = `Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)      rxbytes      txbytes  rhiwat  shiwat    process:pid   state   options           gencnt    flags   flags1 usscnt rtncnt fltrs
tcp4       0      0  127.0.0.1.9222         *.*                    LISTEN             0            0  131072  131072  Google Chrome:9570   00000 00000006 000000000000a1b2 00000000 00000800      1      0 000001
tcp46      0      0  *.7000                 *.*                    LISTEN             0            0  131072  131072  ControlCenter:536    00100 00000006 0000000000000c3d 00000000 00000800      1      0 000001
tcp6       0      0  ::1.631                *.*                    LISTEN             0            0  131072  131072        cupsd:77798  00000 00000006 0000000000000c3e 00000000 00000800      1      0 000001
tcp4       0      0  127.0.0.1.49374        *.*                    LISTEN             0            0  131072  131072  LogiPluginServic:1980 00000 00000006 0000000000000c3f 00000000 00000800      1      0 000001
tcp6       0      0  *.5000                 *.*                    LISTEN             0            0  131072  131072  python3.12:4242      00000 00000006 0000000000000c40 00000000 00000800      1      0 000001
`;

/** macOS `lsof -nP -iTCP -sTCP:LISTEN -Fpcnt`: the user's own processes, names in full. */
export const MAC_LSOF = `p1980
cLogiPluginService
f12
tIPv4
n127.0.0.1:49374
p4242
cpython3.12
f3
tIPv6
n*:5000
p9570
cGoogle Chrome
f45
tIPv4
n127.0.0.1:9222
`;

export const DOCKER_PS = `vaultwarden|vaultwarden/server:latest|0.0.0.0:8080->80/tcp, [::]:8080->80/tcp
db|postgres:16|5432/tcp
web|nginx:alpine|0.0.0.0:8000-8001->8000-8001/tcp, :::8000-8001->8000-8001/tcp
local|app:dev|127.0.0.1:3001->3000/tcp
dns|coredns|0.0.0.0:53->53/udp
`;

export const PROBE_TEST_NONCE = '0123456789abcdef0123456789abcdef';

/**
 * Script output with `sections` framed under the request's nonce, as the script prints it. A
 * null status leaves the section unfinished (the watchdog ended the script).
 */
export function probeOutput(
  os: string,
  sections: readonly (readonly [name: string, body: string, status: number | null])[],
  options: { done?: boolean; nonce?: string } = {},
): string {
  const marker = probeMarker(options.nonce ?? PROBE_TEST_NONCE);
  let text = `login banner noise\n\n${marker} os ${os}\n`;
  for (const [name, body, status] of sections) {
    text += `\n${marker} ${name} begin\n${body}`;
    if (status !== null) text += `\n${marker} ${name} rc=${status}\n`;
  }
  if (options.done ?? true) text += `\n${marker} done\n`;
  return text;
}

function port(number: number, address: string, rest: Partial<ListeningPort> = {}): ListeningPort {
  return {
    port: number,
    address,
    pid: null,
    processName: null,
    containerName: null,
    image: null,
    ...rest,
  };
}

export const DEV_SERVER = port(5173, '0.0.0.0', { pid: 4210, processName: 'node' });
export const VAULTWARDEN = port(8080, '0.0.0.0', {
  processName: 'docker-proxy',
  containerName: 'vaultwarden',
  image: 'vaultwarden/server:latest',
});
export const SSHD = port(22, '0.0.0.0', { processName: 'sshd' });
/** Bound to a public address: listed, never reachable. */
export const PUBLIC_SERVER = port(9443, '203.0.113.7');

export const SAMPLE_REPORT: ListeningPortReport = {
  ports: [VAULTWARDEN, DEV_SERVER, PUBLIC_SERVER, SSHD],
  isTruncated: false,
  readContainers: true,
};

export { port as listeningPort };

/** What a demo Host's port discovery prints under `nonce`: a dev server, a container, system ports. */
export function demoProbeOutput(nonce: string): string {
  return probeOutput(
    'Linux',
    [
      ['ss', DEBIAN_SS, 0],
      ['docker', DOCKER_PS, 0],
    ],
    { nonce },
  );
}
