import type { HostDraft } from '@openagentspocket/core';
import { useSyncExternalStore } from 'react';

type Update = HostDraft | ((current: HostDraft) => HostDraft);

let draft: HostDraft | null = null;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

/**
 * The Host form's draft, shared with the route pages it pushes (Swift keeps it in the form's
 * `@State` and hands the route pages bindings): edits on a route page are live in the form.
 */
export const hostDraftStore = {
  get: (): HostDraft | null => draft,
  set(update: Update | null): void {
    draft =
      update === null ? null : typeof update === 'function' ? update(draft as HostDraft) : update;
    emit();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** The current draft, or null when no form is open. */
export function useHostDraft(): HostDraft | null {
  return useSyncExternalStore(hostDraftStore.subscribe, hostDraftStore.get);
}
