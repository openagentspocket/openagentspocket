import { type Snippet, SnippetStore } from '@openagentspocket/core';
import { useSyncExternalStore } from 'react';
import { deviceStorage } from '@/settings/deviceStorage';

let shared: SnippetStore | undefined;

/** The one Snippet catalog of the app (global, not per Host), on the device storage. */
export function snippetStore(): SnippetStore {
  shared ??= new SnippetStore(deviceStorage);
  return shared;
}

/** The catalog's Snippets; the component re-renders when it changes. */
export function useSnippets(store: SnippetStore): readonly Snippet[] {
  return useSyncExternalStore(
    store.subscribe.bind(store),
    () => store.snippets,
    () => store.snippets,
  );
}
