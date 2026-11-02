import type { HerdrEndpoint } from './herdr-endpoint';
import { isValidHerdrSessionName } from './herdr-endpoint';
import { type AuthMethod, type Host, type HostRoute, hostDisplayName } from './host';
import { trimSpaces } from './text';

/** Makes ids for new routes and Hosts (a UUID in the app, a counter in tests). */
export type IdFactory = () => string;

/** Editable state of one route in the Host form; ports stay text. */
export interface HostRouteDraft {
  readonly id: string;
  readonly address: string;
  readonly port: string;
  /** Blank means the device dials the Host itself. */
  readonly jumpAddress: string;
  readonly jumpPort: string;
  /** Blank reuses the Host's own username. */
  readonly jumpUsername: string;
}

/** Editable form state behind the Host form, validated before it becomes a Host. */
export interface HostDraft {
  readonly name: string;
  readonly username: string;
  readonly authMethod: AuthMethod;
  /** Blank means "keep the stored password" when editing. */
  readonly password: string;
  readonly sessionName: string;
  /** A Pairing Code endpoint, carried through Edit and Duplicate unchanged. */
  readonly herdrEndpoint: HerdrEndpoint | null;
  /** A new Host starts with none and cannot be saved until it has one. */
  readonly routes: readonly HostRouteDraft[];
}

export function emptyRouteDraft(id: string): HostRouteDraft {
  return { id, address: '', port: '22', jumpAddress: '', jumpPort: '22', jumpUsername: '' };
}

export function routeDraftFromRoute(route: HostRoute): HostRouteDraft {
  return {
    id: route.id,
    address: route.address,
    port: String(route.port),
    jumpAddress: route.jumpAddress,
    jumpPort: String(route.jumpPort),
    jumpUsername: route.jumpUsername,
  };
}

/** A TCP port typed into a field: an integer in 1...65535, else null. */
export function parsePort(text: string): number | null {
  if (!/^[+-]?[0-9]+$/.test(text)) return null;
  const value = Number(text);
  return value >= 1 && value <= 65535 ? value : null;
}

export function routeDraftUsesJumpHost(route: HostRouteDraft): boolean {
  return trimSpaces(route.jumpAddress) !== '';
}

/** A blank jump address disables the hop, so its port only has to parse when used. */
export function routeDraftIsValid(route: HostRouteDraft): boolean {
  return (
    trimSpaces(route.address) !== '' &&
    parsePort(route.port) !== null &&
    (!routeDraftUsesJumpHost(route) || parsePort(route.jumpPort) !== null)
  );
}

/** The route a draft describes, or null while invalid. */
export function routeFromDraft(route: HostRouteDraft): HostRoute | null {
  const port = parsePort(route.port);
  if (!routeDraftIsValid(route) || port === null) return null;
  return {
    id: route.id,
    address: trimSpaces(route.address),
    port,
    jumpAddress: trimSpaces(route.jumpAddress),
    jumpPort: parsePort(route.jumpPort) ?? 22,
    jumpUsername: trimSpaces(route.jumpUsername),
  };
}

export function emptyHostDraft(): HostDraft {
  return {
    name: '',
    username: '',
    authMethod: 'deviceKey',
    password: '',
    sessionName: '',
    herdrEndpoint: null,
    routes: [],
  };
}

/** Prefill for editing an existing Host. */
export function hostDraftFromHost(host: Host): HostDraft {
  return {
    name: host.name,
    username: host.username,
    authMethod: host.authMethod,
    password: '',
    sessionName: host.sessionName,
    herdrEndpoint: host.herdrEndpoint,
    routes: host.routes.map(routeDraftFromRoute),
  };
}

/**
 * Prefill for adding a copy of `host`: every field Edit prefills, new route
 * ids, the stored `password` for password authentication, and the next free
 * copy name among `existingNames` (display names).
 */
export function duplicateHostDraft(
  host: Host,
  options: { password: string | null; existingNames: readonly string[]; newId: IdFactory },
): HostDraft {
  const draft = hostDraftFromHost(host);
  return {
    ...draft,
    name: duplicateName(hostDisplayName(host), options.existingNames),
    routes: draft.routes.map((route) => ({ ...route, id: options.newId() })),
    password: host.authMethod === 'password' ? (options.password ?? '') : '',
  };
}

const COPY_SUFFIX = ' copy';

/** `box` for `box copy` and `box copy 3`; any other name is its own stem. */
function copyStem(name: string): string {
  let stem = name;
  const space = stem.lastIndexOf(' ');
  if (space >= 0) {
    const number = stem.slice(space + 1);
    if (/^[0-9]+$/.test(number) && stem.slice(0, space).endsWith(COPY_SUFFIX)) {
      stem = stem.slice(0, space);
    }
  }
  return stem.endsWith(COPY_SUFFIX) ? stem.slice(0, -COPY_SUFFIX.length) : stem;
}

/**
 * Names a copy the way Finder does: `name copy`, then `name copy 2`, ... the
 * first one not taken. Duplicating a copy continues its series.
 */
export function duplicateName(name: string, existingNames: readonly string[]): string {
  const taken = new Set(existingNames.map(trimSpaces));
  const first = `${copyStem(trimSpaces(name))}${COPY_SUFFIX}`;
  if (!taken.has(first)) return first;
  let count = 2;
  while (taken.has(`${first} ${count}`)) count += 1;
  return `${first} ${count}`;
}

/**
 * Edits the first route, creating it when the draft has none yet (the form's
 * single-route fields write through this).
 */
export function updatePrimaryRoute(
  draft: HostDraft,
  patch: Partial<Omit<HostRouteDraft, 'id'>>,
  newId: IdFactory,
): HostDraft {
  const [first, ...rest] = draft.routes;
  return { ...draft, routes: [{ ...(first ?? emptyRouteDraft(newId())), ...patch }, ...rest] };
}

/** Edits the route with `id`; other routes stay as they are. */
export function updateRoute(
  draft: HostDraft,
  id: string,
  patch: Partial<Omit<HostRouteDraft, 'id'>>,
): HostDraft {
  return {
    ...draft,
    routes: draft.routes.map((route) => (route.id === id ? { ...route, ...patch } : route)),
  };
}

/** Removes the routes at `offsets`, keeping at least one. */
export function removeRoutes(draft: HostDraft, offsets: Iterable<number>): HostDraft {
  const removing = new Set(offsets);
  if (removing.size >= draft.routes.length) return draft;
  return { ...draft, routes: draft.routes.filter((_, index) => !removing.has(index)) };
}

/** Reorders routes as a list's move gesture does (SwiftUI `move(fromOffsets:toOffset:)`). */
export function moveRoutes(
  draft: HostDraft,
  source: Iterable<number>,
  destination: number,
): HostDraft {
  const indices = [...new Set(source)].sort((a, b) => a - b);
  const moving = indices.flatMap((index) => draft.routes[index] ?? []);
  const insertion = destination - indices.filter((index) => index < destination).length;
  const kept = draft.routes.filter((_, index) => !indices.includes(index));
  const at = Math.max(0, Math.min(insertion, kept.length));
  return { ...draft, routes: [...kept.slice(0, at), ...moving, ...kept.slice(at)] };
}

export function hostDraftIsValid(draft: HostDraft): boolean {
  const session = trimSpaces(draft.sessionName);
  return (
    draft.routes.length > 0 &&
    draft.routes.every(routeDraftIsValid) &&
    trimSpaces(draft.username) !== '' &&
    (session === '' || isValidHerdrSessionName(session))
  );
}

/**
 * Validity including credential intent: a blank password only means "keep
 * current" when the edited Host already used password authentication.
 */
export function canSaveHostDraft(draft: HostDraft, editing: Host | null): boolean {
  if (!hostDraftIsValid(draft)) return false;
  if (draft.authMethod !== 'password' || draft.password !== '') return true;
  return editing?.authMethod === 'password';
}

/** The Host this draft describes, or null while invalid. Pass the existing id when editing. */
export function hostFromDraft(draft: HostDraft, id: string): Host | null {
  if (!hostDraftIsValid(draft)) return null;
  const routes = draft.routes.map(routeFromDraft);
  const [first, ...rest] = routes;
  if (!first || rest.some((route) => route === null)) return null;
  return {
    id,
    name: trimSpaces(draft.name),
    username: trimSpaces(draft.username),
    authMethod: draft.authMethod,
    sessionName: trimSpaces(draft.sessionName),
    herdrEndpoint: draft.herdrEndpoint,
    routes: [first, ...(rest as HostRoute[])],
  };
}

/** The password to store on save, or null for "leave storage as it is". */
export function passwordUpdate(draft: HostDraft): string | null {
  return draft.authMethod === 'password' && draft.password !== '' ? draft.password : null;
}
