import { describe, expect, it } from 'vitest';
import {
  isLocallyScoped,
  isRouteHostKeySecurityFailure,
  mayNameAnotherMachine,
  parseIPv6,
  routeFailures,
  routeLabel,
  type SSHRoute,
} from './ssh-route';

const direct = (host: string, port = 22): SSHRoute => ({ host, port, jump: null, id: null });
const jump = { host: 'vps.example', port: 22, username: 'dev' };

describe('mayNameAnotherMachine', () => {
  it.each([
    '192.168.1.5',
    '10.0.0.5',
    '172.16.0.1',
    '172.31.255.1',
    '127.0.0.1',
    '169.254.10.1',
    '::1',
    'fd12:3456::1',
    'fe80::1%en0',
    '[fe80::1]',
    'nas',
    'localhost',
    'nas.local',
    'nas.local.',
    'box.home.arpa',
    'box.lan',
    'box.internal',
    'box.home',
    'box.localdomain',
    ' NAS.Local ',
  ])('a direct route to %s may name another machine', (address) => {
    expect(mayNameAnotherMachine(direct(address))).toBe(true);
  });

  it.each([
    '172.32.0.1',
    '100.64.0.5',
    '203.0.113.5',
    '2001:db8::1',
    'box.example',
    'vps.example.com',
    '172.15.0.1',
    '192.169.0.1',
  ])('a direct route to %s names the same machine everywhere', (address) => {
    expect(mayNameAnotherMachine(direct(address))).toBe(false);
  });

  it('a route through a Jump Host never may', () => {
    expect(mayNameAnotherMachine({ ...direct('192.168.1.5'), jump })).toBe(false);
  });

  it('reads IPv4 as inet_pton does (no leading zeros, four parts)', () => {
    // Not an IPv4 address, so a dotted name: not local.
    expect(isLocallyScoped('010.0.0.5')).toBe(false);
    expect(isLocallyScoped('10.0.5')).toBe(false);
    expect(isLocallyScoped('10.0.0.256')).toBe(false);
  });

  it('parses IPv6 forms', () => {
    expect(parseIPv6('::1')).toEqual([...new Array(15).fill(0), 1]);
    expect(parseIPv6('::ffff:192.168.1.5')?.slice(10)).toEqual([0xff, 0xff, 192, 168, 1, 5]);
    expect(parseIPv6('1:2:3:4:5:6:7:8')).toHaveLength(16);
    for (const bad of ['1::2::3', ':1', '1:2:3:4:5:6:7:8:9', '12345::1', '1:2:3:4:5:6:7:8::']) {
      expect(parseIPv6(bad)).toBeNull();
    }
  });
});

describe('route labels and failures', () => {
  it('names the port and the Jump Host with its port', () => {
    expect(routeLabel(direct('10.0.0.5'))).toBe('10.0.0.5');
    expect(routeLabel({ ...direct('127.0.0.1', 2222), jump })).toBe(
      '127.0.0.1:2222 via vps.example',
    );
    expect(routeLabel({ ...direct('127.0.0.1', 2222), jump: { ...jump, port: 2022 } })).toBe(
      '127.0.0.1:2222 via vps.example:2022',
    );
  });

  const mismatch = { kind: 'hostKeyMismatch' };
  const timedOut = { kind: 'timedOut' };
  const isSecurity = (error: { kind: string }) => error.kind === 'hostKeyMismatch';

  it('pairs each route with its error in order', () => {
    const routes = [direct('192.168.1.5'), { ...direct('100.64.0.5'), id: 'b' }];
    expect(routeFailures(routes, [timedOut, mismatch])).toEqual([
      { route: '192.168.1.5', mayNameAnotherMachine: true, error: timedOut, routeId: null },
      { route: '100.64.0.5', mayNameAnotherMachine: false, error: mismatch, routeId: 'b' },
    ]);
  });

  it('excuses a changed key only where another machine may answer', () => {
    const [lan, publicAddress, behindJump] = routeFailures(
      [direct('192.168.1.5'), direct('box.example'), { ...direct('192.168.1.5'), jump }],
      [mismatch, mismatch, mismatch],
    );
    expect(lan && isRouteHostKeySecurityFailure(lan, isSecurity)).toBe(false);
    expect(publicAddress && isRouteHostKeySecurityFailure(publicAddress, isSecurity)).toBe(true);
    expect(behindJump && isRouteHostKeySecurityFailure(behindJump, isSecurity)).toBe(true);
  });
});
