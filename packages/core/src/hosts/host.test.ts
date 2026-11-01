import { describe, expect, it } from 'vitest';
import sessionVector from '../../../plugin/test-vectors/notification-session-v1.json';
import {
  isQuotableAbsolutePath,
  isValidHerdrSessionName,
  makeHerdrEndpoint,
  sessionFromSocketPath,
  socketPath,
} from './herdr-endpoint';
import {
  decodeHost,
  type Host,
  hostAnswersToAddress,
  hostConnectionSummary,
  hostDisplayName,
  hostRoute,
  hostSocketLocation,
  jumpUsernameOn,
  routeSummary,
} from './host';
import { sshRoutesForHost } from './ssh-route';

const host = (fields: Partial<Host> = {}): Host => ({
  id: 'h1',
  name: '',
  username: 'dev',
  authMethod: 'deviceKey',
  sessionName: '',
  herdrEndpoint: null,
  routes: [hostRoute({ id: 'r1', address: 'box.example' })],
  ...fields,
});

describe('Host', () => {
  it('round-trips through storage with its routes in order', () => {
    const original = host({
      routes: [
        hostRoute({ id: 'a', address: '192.168.1.5' }),
        hostRoute({ id: 'b', address: '127.0.0.1', port: 2222, jumpAddress: 'vps.example' }),
      ],
      herdrEndpoint: makeHerdrEndpoint('/opt/x/herdr/herdr.sock', '/opt/x/bin/herdr'),
    });
    expect(decodeHost(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });

  it('reads optional fields with their defaults', () => {
    const decoded = decodeHost({
      id: 'h',
      name: '',
      username: 'dev',
      authMethod: 'password',
      routes: [{ id: 'r', address: 'box.example', port: 22 }],
    });
    expect(decoded?.sessionName).toBe('');
    expect(decoded?.herdrEndpoint).toBeNull();
    expect(decoded?.routes[0]).toEqual(hostRoute({ id: 'r', address: 'box.example' }));
  });

  it.each([
    ['an unknown auth method', { authMethod: 'openssh' }],
    ['no routes', { routes: [] }],
    ['a bad port', { routes: [{ id: 'r', address: 'a', port: 0 }] }],
    ['an invalid session name', { sessionName: '../prod' }],
    ['an invalid endpoint', { herdrEndpoint: { socketPath: 'rel', executablePath: '/x' } }],
    ['a missing username', { username: undefined }],
  ])('refuses a stored Host with %s', (_name, patch) => {
    expect(decodeHost({ ...JSON.parse(JSON.stringify(host())), ...patch })).toBeNull();
  });

  it('answers to the address of any route, ignoring case and spaces', () => {
    const subject = host({
      routes: [
        hostRoute({ id: 'a', address: '192.168.1.5' }),
        hostRoute({ id: 'b', address: 'Box.Tailnet.ts.net' }),
      ],
    });
    expect(hostAnswersToAddress(subject, '192.168.1.5')).toBe(true);
    expect(hostAnswersToAddress(subject, ' box.tailnet.ts.net ')).toBe(true);
    expect(hostAnswersToAddress(subject, '10.0.0.1')).toBe(false);
  });

  it('summarizes a route with its Jump Host', () => {
    expect(
      routeSummary(
        hostRoute({
          id: 'r',
          address: '127.0.0.1',
          port: 2222,
          jumpAddress: 'vps.example',
          jumpPort: 2022,
        }),
      ),
    ).toBe('127.0.0.1:2222 via vps.example:2022');
    expect(routeSummary(hostRoute({ id: 'r', address: '10.0.0.5' }))).toBe('10.0.0.5');
  });

  it('keeps each route its own Jump Host account, falling back to the Host one', () => {
    const subject = host({
      routes: [
        hostRoute({
          id: 'a',
          address: '127.0.0.1',
          jumpAddress: 'a.example',
          jumpUsername: 'tunnel',
        }),
        hostRoute({ id: 'b', address: '127.0.0.1', jumpAddress: 'b.example' }),
      ],
    });
    expect(jumpUsernameOn(subject, subject.routes[0])).toBe('tunnel');
    expect(jumpUsernameOn(subject, subject.routes[1] ?? subject.routes[0])).toBe('dev');
  });

  it('names the only route, or counts several', () => {
    expect(hostConnectionSummary(host())).toEqual({ kind: 'address', text: 'dev@box.example' });
    expect(
      hostConnectionSummary(
        host({ routes: [hostRoute({ id: 'r', address: 'box.example', port: 2222 })] }),
      ),
    ).toEqual({ kind: 'address', text: 'dev@box.example:2222' });
    expect(
      hostConnectionSummary(
        host({
          routes: [
            hostRoute({ id: 'a', address: '192.0.2.10' }),
            hostRoute({ id: 'b', address: 'x' }),
          ],
        }),
      ),
    ).toEqual({ kind: 'routes', username: 'dev', count: 2 });
  });

  it('falls back to user@address when unnamed', () => {
    expect(hostDisplayName(host())).toBe('dev@box.example');
    expect(hostDisplayName(host({ name: ' Workbox ' }))).toBe('Workbox');
  });

  it('offers every route to the transport, trimmed, with the Jump Host account', () => {
    const subject = host({
      routes: [
        hostRoute({ id: 'a', address: ' 192.168.1.5 ' }),
        hostRoute({ id: 'b', address: '127.0.0.1', port: 2222, jumpAddress: ' vps.example ' }),
      ],
    });
    expect(sshRoutesForHost(subject)).toEqual([
      { host: '192.168.1.5', port: 22, jump: null, id: 'a' },
      {
        host: '127.0.0.1',
        port: 2222,
        jump: { host: 'vps.example', port: 22, username: 'dev' },
        id: 'b',
      },
    ]);
  });
});

describe('herdr session and endpoint rules', () => {
  it.each(['work session', '../prod', '.', '..', 'work/session', 'a'.repeat(65), '', 'tést'])(
    'refuses the session name %j',
    (name) => expect(isValidHerdrSessionName(name)).toBe(false),
  );

  it('accepts the herdr character set up to 64 bytes', () => {
    expect(isValidHerdrSessionName(`${'a'.repeat(60)}._-9`)).toBe(true);
  });

  it.each([
    [undefined, ''],
    ['', ''],
    ['/home/dev/.config/herdr/herdr.sock', ''],
    ['/home/dev/.config/herdr/sessions/work/herdr.sock', 'work'],
    ['/x/herdr/sessions/herdr/herdr.sock', 'herdr'],
    ['/x/herdr/sessions/bad name/herdr.sock', null],
    ['/tmp/other.sock', null],
  ])('reads the session of socket %j as %j', (path, session) => {
    expect(sessionFromSocketPath(path)).toBe(session);
  });

  it.each(sessionVector.names)(
    'rules on the shared vector name $name as valid: $valid',
    (entry) => {
      expect(isValidHerdrSessionName(entry.name)).toBe(entry.valid);
    },
  );

  it.each(sessionVector.derivation)(
    'derives the session of the shared vector case: $name',
    (entry) => {
      expect(sessionFromSocketPath(entry.socketPath)).toBe(entry.session);
    },
  );

  it('builds an endpoint only from quotable absolute paths in herdr layout', () => {
    const socket = '/Users/dev/Library/Application Support/Example/herdr/herdr.sock';
    expect(makeHerdrEndpoint(socket, '/opt/bin/herdr')).toEqual({
      socketPath: socket,
      executablePath: '/opt/bin/herdr',
    });
    expect(makeHerdrEndpoint('/tmp/x.sock', '/opt/bin/herdr')).toBeNull();
    expect(makeHerdrEndpoint(socket, 'herdr')).toBeNull();
    expect(makeHerdrEndpoint(`/${'a'.repeat(80)}/herdr/herdr.sock`, '/bin/h')).toBeNull();
    expect(isQuotableAbsolutePath("/it's")).toBe(false);
    expect(isQuotableAbsolutePath('/back\\slash')).toBe(false);
    expect(isQuotableAbsolutePath('/tab\there')).toBe(false);
  });

  it('targets the endpoint socket, else the session socket under home', () => {
    const endpoint = makeHerdrEndpoint('/opt/x/herdr/herdr.sock', '/opt/x/bin/herdr');
    expect(hostSocketLocation(host({ sessionName: 'work', herdrEndpoint: endpoint }))).toEqual({
      kind: 'absolutePath',
      path: '/opt/x/herdr/herdr.sock',
    });
    expect(socketPath(hostSocketLocation(host({ sessionName: ' work ' })), '/home/dev/')).toBe(
      '/home/dev/.config/herdr/sessions/work/herdr.sock',
    );
    expect(socketPath(hostSocketLocation(host()), '/home/dev')).toBe(
      '/home/dev/.config/herdr/herdr.sock',
    );
  });
});
