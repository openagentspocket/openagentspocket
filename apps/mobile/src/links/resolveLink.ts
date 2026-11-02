import { type Host, hostAnswersToAddress, hostSocketLocation } from '@openagentspocket/core';
import type { AppLink, HostReference } from './appLink';

export type LinkDestination =
  | { readonly kind: 'agent'; readonly hostId: string; readonly paneId: string }
  | { readonly kind: 'console' }
  | { readonly kind: 'usage'; readonly limits: boolean };

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function onSession(host: Host, session: string | null): boolean {
  const location = hostSocketLocation(host);
  if (session === null) return location.kind === 'defaultSession';
  return location.kind === 'namedSession' && location.name === session;
}

/**
 * The saved Host a reference names. An id is taken as is (matched to a saved Host ignoring case, so
 * ids written by another app version still land). Another app's address-or-name is looked up on its
 * herdr session, by address first and by name only when no address matches; two answers is no answer.
 */
export function resolveHostId(reference: HostReference, hosts: readonly Host[]): string | null {
  if (reference.kind === 'id') {
    const known = hosts.find((host) => sameText(host.id, reference.id));
    return known ? known.id : reference.id;
  }
  const candidates = hosts.filter((host) => onSession(host, reference.session));
  const byAddress = candidates.filter((host) => hostAnswersToAddress(host, reference.value));
  const found =
    byAddress.length > 0
      ? byAddress
      : candidates.filter((host) => sameText(host.name, reference.value));
  const [only] = found;
  return found.length === 1 && only ? only.id : null;
}

/** Where a link lands among the saved `hosts`; the Console when it names no single agent. */
export function resolveLink(link: AppLink, hosts: readonly Host[]): LinkDestination {
  if (link.kind === 'usage') return { kind: 'usage', limits: link.limits };
  const hostId = resolveHostId(link.host, hosts);
  if (hostId === null || link.paneId === null) return { kind: 'console' };
  return { kind: 'agent', hostId, paneId: link.paneId };
}
