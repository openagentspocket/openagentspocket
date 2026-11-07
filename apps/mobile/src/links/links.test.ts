import { type Host, hostRoute } from '@openagentspocket/core';
import { agentUrl, consoleUrl, parseAppLink } from './appLink';
import { redirectLink } from './nativeIntent';
import { resolveLink } from './resolveLink';

const HOST_ID = '6A1F4E0C-2B7D-4C3A-9E51-0D8B7F6A2C19';
const PANES = ['wV:p1H', 'w1C:p1', '%7', 'a/b c"d', 'ペイン:1'];

function host(fields: Partial<Host> & Pick<Host, 'id'>): Host {
  return {
    name: '',
    username: 'me',
    authMethod: 'deviceKey',
    sessionName: '',
    herdrEndpoint: null,
    routes: [hostRoute({ id: 'r', address: 'box.example' })],
    ...fields,
  };
}

describe('parseAppLink', () => {
  it.each(PANES)('round-trips pane %s through both schemes', (pane) => {
    const url = agentUrl(HOST_ID, pane);
    const expected = { kind: 'agent', host: { kind: 'id', id: HOST_ID }, paneId: pane };
    expect(parseAppLink(url)).toEqual(expected);
    expect(parseAppLink(url.replace(/^openagentspocket/, 'agentico'))).toEqual(expected);
  });

  it('opens the Console for a host-only link, trailing slash included', () => {
    const console = { kind: 'agent', host: { kind: 'id', id: HOST_ID }, paneId: null };
    expect(parseAppLink(consoleUrl(HOST_ID))).toEqual(console);
    expect(parseAppLink(`${consoleUrl(HOST_ID)}/`)).toEqual(console);
  });

  it('reads the lookup form, dropping the default session', () => {
    expect(parseAppLink('agentico://agent?host=Box.Example&session=work&pane=w1:p2')).toEqual({
      kind: 'agent',
      host: { kind: 'lookup', value: 'Box.Example', session: 'work' },
      paneId: 'w1:p2',
    });
    expect(parseAppLink('agentico://agent?host=box&session=default')).toEqual({
      kind: 'agent',
      host: { kind: 'lookup', value: 'box', session: null },
      paneId: null,
    });
  });

  it('reads a Live Activity answer, and opens the same Agent', () => {
    const url = `${agentUrl(HOST_ID, 'w1:p1')}?answer=approve&bid=abcdefghijk`;
    expect(parseAppLink(url)).toEqual({
      kind: 'agent',
      host: { kind: 'id', id: HOST_ID },
      paneId: 'w1:p1',
      answer: { decision: 'approve', episodeId: 'abcdefghijk' },
    });
    expect(redirectLink(url)).toBe(`/agent/${HOST_ID}/w1%3Ap1`);
  });

  it.each(['answer=press&bid=abcdefghijk', 'answer=approve', 'bid=abcdefghijk'])(
    'reads no answer from %s',
    (query) => {
      expect(parseAppLink(`${agentUrl(HOST_ID, 'w1:p1')}?${query}`)).toEqual({
        kind: 'agent',
        host: { kind: 'id', id: HOST_ID },
        paneId: 'w1:p1',
      });
    },
  );

  it('reads no answer without a pane', () => {
    const link = parseAppLink(`${consoleUrl(HOST_ID)}?answer=deny&bid=abcdefghijk`);
    expect(link).toEqual({ kind: 'agent', host: { kind: 'id', id: HOST_ID }, paneId: null });
  });

  it('reads the path form Expo Router hands over', () => {
    expect(parseAppLink(`/agent/${HOST_ID}/w1%3Ap1`)).toEqual({
      kind: 'agent',
      host: { kind: 'id', id: HOST_ID },
      paneId: 'w1:p1',
    });
  });

  it.each([
    'https://agent/x',
    'other://agent/6A1F4E0C-2B7D-4C3A-9E51-0D8B7F6A2C19',
    'agentico://agent',
    'agentico://agent/not-a-uuid/w1:p1',
    `agentico://agent/${HOST_ID}/a/b`,
    'agentico://agent?host=a&host=b',
    'agentico://agent?host=',
    'agentico://agent?host=%E0%A4%A',
    'agentico://nothing',
    'plain text',
  ])('rejects %s', (url) => {
    expect(parseAppLink(url)).toBeNull();
  });

  it('reads the widget usage links', () => {
    expect(parseAppLink('agentico://usage')).toEqual({
      kind: 'usage',
      hostId: null,
      limits: false,
    });
    expect(parseAppLink(`agentico://usage?host=${HOST_ID}`)).toEqual({
      kind: 'usage',
      hostId: HOST_ID,
      limits: false,
    });
    expect(parseAppLink(`agentico://usage/limits?host=${HOST_ID}`)).toEqual({
      kind: 'usage',
      hostId: HOST_ID,
      limits: true,
    });
    expect(parseAppLink('agentico://usage/limits')).toBeNull();
  });
});

describe('resolveLink', () => {
  const hosts = [
    host({ id: 'a', name: 'Laptop', routes: [hostRoute({ id: 'r1', address: 'a.example' })] }),
    host({
      id: 'b',
      name: 'Work',
      sessionName: 'work',
      routes: [hostRoute({ id: 'r2', address: 'a.example' })],
    }),
    host({ id: 'c', name: 'Twin', routes: [hostRoute({ id: 'r3', address: 'c.example' })] }),
    host({ id: 'd', name: 'twin', routes: [hostRoute({ id: 'r4', address: 'd.example' })] }),
  ];
  const lookup = (value: string, session: string | null, paneId: string | null) =>
    resolveLink({ kind: 'agent', host: { kind: 'lookup', value, session }, paneId }, hosts);

  it('finds a Host by address on its session', () => {
    expect(lookup('A.Example ', null, 'w1:p1')).toEqual({
      kind: 'agent',
      hostId: 'a',
      paneId: 'w1:p1',
    });
    expect(lookup('a.example', 'work', 'w1:p1')).toEqual({
      kind: 'agent',
      hostId: 'b',
      paneId: 'w1:p1',
    });
  });

  it('falls back to the name only when no address matches', () => {
    expect(lookup('laptop', null, 'p')).toEqual({ kind: 'agent', hostId: 'a', paneId: 'p' });
  });

  it('opens the Console when nothing or several answer, or no pane is named', () => {
    expect(lookup('twin', null, 'p')).toEqual({ kind: 'console' });
    expect(lookup('unknown', null, 'p')).toEqual({ kind: 'console' });
    expect(lookup('a.example', null, null)).toEqual({ kind: 'console' });
  });

  it('keeps an id, adopting the saved Host id when only the case differs', () => {
    const saved = [host({ id: HOST_ID.toLowerCase() })];
    const link = parseAppLink(agentUrl(HOST_ID, 'w1:p1'));
    expect(link && resolveLink(link, saved)).toEqual({
      kind: 'agent',
      hostId: HOST_ID.toLowerCase(),
      paneId: 'w1:p1',
    });
    expect(link && resolveLink(link, [])).toEqual({
      kind: 'agent',
      hostId: HOST_ID,
      paneId: 'w1:p1',
    });
  });
});

describe('redirectLink', () => {
  it('keeps dev route paths', () => {
    expect(redirectLink('openagentspocket://__atlas/home?theme=papel')).toBe(
      '/__atlas/home?theme=papel',
    );
    expect(redirectLink('agentico:///__ssh?auto=1')).toBe('/__ssh?auto=1');
  });

  it('routes the agent link of either scheme to the detail route', () => {
    const route = `/agent/${HOST_ID}/w1%3Ap1`;
    expect(redirectLink(`openagentspocket://agent/${HOST_ID}/w1:p1`)).toBe(route);
    expect(redirectLink(`agentico://agent/${HOST_ID}/w1:p1`)).toBe(route);
  });

  it('routes Console, lookup and usage links', () => {
    expect(redirectLink(consoleUrl(HOST_ID))).toBe('/');
    expect(redirectLink('agentico://agent?host=box&session=work&pane=w1:p1')).toBe(
      '/agent?host=box&session=work&pane=w1%3Ap1',
    );
    expect(redirectLink('agentico://usage')).toBe('/usage');
    expect(redirectLink(`agentico://usage/limits?host=${HOST_ID}`)).toBe('/usage-limits');
  });

  it('routes a link of ours that names a screen, whether or not the scheme was stripped', () => {
    expect(redirectLink('openagentspocket:///hosts')).toBe('/hosts');
    expect(redirectLink('openagentspocket://hosts')).toBe('/hosts');
    expect(redirectLink('agentico://settings/notifications')).toBe('/settings/notifications');
    expect(redirectLink('openagentspocket://')).toBe('/');
  });

  it('lets other paths through and sends a malformed link of ours Home', () => {
    expect(redirectLink('/hosts')).toBe('/hosts');
    expect(redirectLink('agentico://agent/nope')).toBe('/');
  });
});
