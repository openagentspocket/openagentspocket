import { describe, expect, it } from 'vitest';
import { makeHerdrEndpoint } from './herdr-endpoint';
import { type Host, hostDisplayName, hostRoute, primaryRoute } from './host';
import {
  canSaveHostDraft,
  duplicateHostDraft,
  duplicateName,
  emptyHostDraft,
  emptyRouteDraft,
  type HostDraft,
  hostDraftFromHost,
  hostDraftIsValid,
  hostFromDraft,
  moveRoutes,
  passwordUpdate,
  removeRoutes,
  updatePrimaryRoute,
  updateRoute,
} from './host-draft';

let counter = 0;
const newId = () => `id-${++counter}`;

const host = (fields: Partial<Host> = {}): Host => ({
  id: 'h1',
  name: 'Workbox',
  username: 'dev',
  authMethod: 'deviceKey',
  sessionName: '',
  herdrEndpoint: null,
  routes: [hostRoute({ id: 'r1', address: 'box.example' })],
  ...fields,
});

/** A draft with one route at `address`, as the single-route form fields build it. */
const draftAt = (address: string, fields: Partial<HostDraft> = {}): HostDraft =>
  updatePrimaryRoute({ ...emptyHostDraft(), username: 'dev', ...fields }, { address }, newId);

const draftWithRoutes = (addresses: string[]): HostDraft => ({
  ...emptyHostDraft(),
  username: 'dev',
  routes: addresses.map((address) => ({ ...emptyRouteDraft(newId()), address })),
});

const endpoint = makeHerdrEndpoint(
  '/Users/dev/Library/Application Support/Example/herdr/herdr.sock',
  '/Users/dev/Library/Application Support/Example/bin/herdr',
);

describe('host draft', () => {
  it('prefills from a Host and rebuilds it with its id', () => {
    const subject = host({
      authMethod: 'password',
      sessionName: 'work',
      routes: [hostRoute({ id: 'r1', address: 'box.example', port: 2222 })],
    });
    expect(hostFromDraft(hostDraftFromHost(subject), subject.id)).toEqual(subject);
  });

  it('round-trips a Jump Host and several routes in order', () => {
    const subject = host({
      routes: [
        hostRoute({
          id: 'a',
          address: '127.0.0.1',
          port: 12_222,
          jumpAddress: 'jump.example',
          jumpPort: 2022,
          jumpUsername: 'tunnel',
        }),
        hostRoute({ id: 'b', address: '100.64.0.5' }),
      ],
    });
    expect(hostFromDraft(hostDraftFromHost(subject), subject.id)).toEqual(subject);
  });

  it('reads a blank jump address as a direct connection, and the jump port only when used', () => {
    let draft = updatePrimaryRoute(draftAt('box.example'), { jumpPort: 'not-a-port' }, newId);
    expect(hostDraftIsValid(draft)).toBe(true);
    expect(hostFromDraft(draft, 'h')?.routes[0].jumpAddress).toBe('');

    draft = updatePrimaryRoute(draft, { jumpAddress: 'jump.example' }, newId);
    expect(hostDraftIsValid(draft)).toBe(false);

    draft = updatePrimaryRoute(draft, { jumpPort: '2022' }, newId);
    expect(hostDraftIsValid(draft)).toBe(true);
  });

  it('trims fields on save', () => {
    const draft = updatePrimaryRoute(
      { ...emptyHostDraft(), name: ' Workbox ', username: ' dev ', sessionName: ' work ' },
      { address: ' box.example ', jumpUsername: ' tunnel ' },
      newId,
    );
    const saved = hostFromDraft(draft, 'h');
    expect(saved).toMatchObject({ name: 'Workbox', username: 'dev', sessionName: 'work' });
    expect(saved && primaryRoute(saved)).toMatchObject({
      address: 'box.example',
      port: 22,
      jumpUsername: 'tunnel',
    });
  });

  it('refuses a blank address or username', () => {
    expect(hostDraftIsValid(draftAt(''))).toBe(false);
    expect(hostFromDraft(draftAt(''), 'h')).toBeNull();
    expect(hostDraftIsValid(draftAt('box.example', { username: '   ' }))).toBe(false);
  });

  it.each(['', '0', '65536', 'abc', '-1', '22.0', ' 22'])('refuses the port %j', (port) => {
    expect(hostDraftIsValid(updatePrimaryRoute(draftAt('box.example'), { port }, newId))).toBe(
      false,
    );
  });

  it.each(['work session', '../prod', '.', '..', 'work/session', 'a'.repeat(65)])(
    'refuses the session name %j herdr would refuse',
    (sessionName) => expect(hostDraftIsValid(draftAt('host.example', { sessionName }))).toBe(false),
  );

  it('accepts the herdr session character set and length limit', () => {
    expect(
      hostDraftIsValid(draftAt('host.example', { sessionName: `${'a'.repeat(60)}._-9` })),
    ).toBe(true);
  });

  it('updates the password only for password auth with an entry', () => {
    expect(
      passwordUpdate({ ...emptyHostDraft(), authMethod: 'password', password: 'hunter2' }),
    ).toBe('hunter2');
    expect(
      passwordUpdate({ ...emptyHostDraft(), authMethod: 'password', password: '' }),
    ).toBeNull();
    expect(
      passwordUpdate({ ...emptyHostDraft(), authMethod: 'deviceKey', password: 'hunter2' }),
    ).toBeNull();
  });

  it('needs a password for a new password Host', () => {
    const draft = draftAt('host.example', { authMethod: 'password' });
    expect(canSaveHostDraft(draft, null)).toBe(false);
    expect(canSaveHostDraft({ ...draft, password: 'secret' }, null)).toBe(true);
  });

  it('keeps an existing password only for a Host that already used one', () => {
    const passwordHost = host({ authMethod: 'password' });
    expect(canSaveHostDraft(hostDraftFromHost(passwordHost), passwordHost)).toBe(true);

    const keyHost = host();
    const switched = { ...hostDraftFromHost(keyHost), authMethod: 'password' as const };
    expect(canSaveHostDraft(switched, keyHost)).toBe(false);
  });

  it('keeps a Pairing Code endpoint through Edit, and drafts without one make Hosts without one', () => {
    const subject = host({ herdrEndpoint: endpoint });
    const edited = hostFromDraft({ ...hostDraftFromHost(subject), name: 'Renamed' }, subject.id);
    expect(edited?.herdrEndpoint).toEqual(endpoint);
    expect(edited?.name).toBe('Renamed');
    expect(hostFromDraft(draftAt('box.example'), 'h')?.herdrEndpoint).toBeNull();
  });
});

describe('duplicating a Host', () => {
  it('copies every field under a copy name, as a new Host with new route ids', () => {
    const original = host({
      name: 'laya-train',
      authMethod: 'rsaKey',
      sessionName: 'work',
      herdrEndpoint: endpoint,
      routes: [
        hostRoute({
          id: 'r1',
          address: '100.64.0.7',
          port: 2201,
          jumpAddress: 'jump.example',
          jumpPort: 2022,
          jumpUsername: 'tunnel',
        }),
      ],
    });
    const draft = duplicateHostDraft(original, {
      password: null,
      existingNames: ['laya-train'],
      newId,
    });
    const copy = hostFromDraft(draft, 'copy-id');

    expect(copy?.routes[0].id).not.toBe('r1');
    expect(copy).toEqual({
      ...original,
      id: 'copy-id',
      name: 'laya-train copy',
      routes: [{ ...original.routes[0], id: copy?.routes[0].id }],
    });
    expect(canSaveHostDraft(draft, null)).toBe(true);
  });

  it('carries the password only for password Hosts', () => {
    const passwordHost = host({ authMethod: 'password' });
    const copied = duplicateHostDraft(passwordHost, {
      password: 'hunter2',
      existingNames: [],
      newId,
    });
    expect(passwordUpdate(copied)).toBe('hunter2');
    expect(canSaveHostDraft(copied, null)).toBe(true);

    // An unreadable stored password leaves the copy unsavable until one is entered.
    const unread = duplicateHostDraft(passwordHost, { password: null, existingNames: [], newId });
    expect(unread.password).toBe('');
    expect(canSaveHostDraft(unread, null)).toBe(false);

    expect(
      duplicateHostDraft(host(), { password: 'stale', existingNames: [], newId }).password,
    ).toBe('');
  });

  it('names copies the way Finder does', () => {
    expect(duplicateName('box', ['box'])).toBe('box copy');
    expect(duplicateName('box', ['box', 'box copy'])).toBe('box copy 2');
    expect(duplicateName('box', ['box', 'box copy', 'box copy 2', 'box copy 4'])).toBe(
      'box copy 3',
    );
    // Duplicating a copy continues its series.
    expect(duplicateName('box copy', ['box', 'box copy'])).toBe('box copy 2');
    expect(duplicateName('box copy 2', ['box', 'box copy', 'box copy 2'])).toBe('box copy 3');
    // A number without the copy marker belongs to the name.
    expect(duplicateName('ubuntu 22', [])).toBe('ubuntu 22 copy');
    expect(duplicateName('copy', [])).toBe('copy copy');
  });

  it('copies the display name of an unnamed Host', () => {
    const original = host({ name: '' });
    const draft = duplicateHostDraft(original, {
      password: null,
      existingNames: [hostDisplayName(original)],
      newId,
    });
    const copy = hostFromDraft(draft, 'c');
    expect(copy && hostDisplayName(copy)).toBe('dev@box.example copy');
  });
});

describe('host draft routes', () => {
  it('starts a new Host without a route, unsavable until one exists', () => {
    const draft = { ...emptyHostDraft(), username: 'dev' };
    expect(draft.routes).toEqual([]);
    expect(canSaveHostDraft(draft, null)).toBe(false);

    const withRoute = updatePrimaryRoute(draft, { address: '192.168.1.5' }, newId);
    expect(withRoute.routes).toHaveLength(1);
    expect(canSaveHostDraft(withRoute, null)).toBe(true);
  });

  it('needs every route to be valid', () => {
    let draft = draftWithRoutes(['192.168.1.5', '']);
    expect(hostDraftIsValid(draft)).toBe(false);
    expect(hostFromDraft(draft, 'h')).toBeNull();

    const second = draft.routes[1]?.id ?? '';
    draft = updateRoute(draft, second, {
      address: '100.64.0.5',
      jumpAddress: 'jump.example',
      jumpPort: 'nope',
    });
    expect(hostDraftIsValid(draft)).toBe(false);

    draft = updateRoute(draft, second, { jumpPort: '22' });
    expect(hostDraftIsValid(draft)).toBe(true);
  });

  it('never removes the last route', () => {
    let draft = draftWithRoutes(['a', 'b', 'c']);
    draft = removeRoutes(draft, [0, 2]);
    expect(draft.routes.map((r) => r.address)).toEqual(['b']);
    draft = removeRoutes(draft, [0]);
    expect(draft.routes.map((r) => r.address)).toEqual(['b']);
  });

  it('reorders as a list move does', () => {
    let draft = draftWithRoutes(['a', 'b', 'c']);
    draft = moveRoutes(draft, [2], 0);
    expect(draft.routes.map((r) => r.address)).toEqual(['c', 'a', 'b']);
    draft = moveRoutes(draft, [0], 3);
    expect(draft.routes.map((r) => r.address)).toEqual(['a', 'b', 'c']);
    draft = moveRoutes(draft, [0, 1], 3);
    expect(draft.routes.map((r) => r.address)).toEqual(['c', 'a', 'b']);
  });
});
