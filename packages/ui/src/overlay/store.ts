import { useEffect, useId, useSyncExternalStore } from 'react';

type Listener = () => void;

export interface Queue<T> {
  push(item: T): void;
  remove(item: T): void;
  snapshot(): readonly T[];
  subscribe(listener: Listener): () => void;
}

/** A tiny observable FIFO, read by a host with useSyncExternalStore. */
export function createQueue<T>(): Queue<T> {
  let items: readonly T[] = [];
  const listeners = new Set<Listener>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  return {
    push(item) {
      items = [...items, item];
      emit();
    },
    remove(item) {
      if (!items.includes(item)) return;
      items = items.filter((entry) => entry !== item);
      emit();
    },
    snapshot: () => items,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useQueue<T>(queue: Queue<T>): readonly T[] {
  return useSyncExternalStore(queue.subscribe, queue.snapshot, queue.snapshot);
}

export type HostKind = 'alert' | 'toast';

const hosts: Record<HostKind, string[]> = { alert: [], toast: [] };
const hostListeners = new Set<Listener>();
const emitHosts = () => {
  for (const listener of hostListeners) listener();
};
const subscribeHosts = (listener: Listener) => {
  hostListeners.add(listener);
  return () => {
    hostListeners.delete(listener);
  };
};

/** Whether some host of `kind` is mounted to present requests. */
export const hasHost = (kind: HostKind) => hosts[kind].length > 0;

/**
 * Registers a host while mounted and says whether it is the one that presents:
 * the most recently mounted host wins, so a screen (the gallery) can mount its
 * own themed host over the app's without both drawing the same request.
 */
export function useActiveHost(kind: HostKind): boolean {
  const id = useId();
  useEffect(() => {
    hosts[kind] = [...hosts[kind], id];
    emitHosts();
    return () => {
      hosts[kind] = hosts[kind].filter((entry) => entry !== id);
      emitHosts();
    };
  }, [kind, id]);
  const top = () => hosts[kind].at(-1) ?? null;
  return useSyncExternalStore(subscribeHosts, top, top) === id;
}
