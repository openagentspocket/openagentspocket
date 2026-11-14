import { useCallback, useEffect, useId, useSyncExternalStore } from 'react';
import { alertQueue } from './confirm';

/** A dismissal that never reports back still frees the screen after this long. */
const DISMISS_FALLBACK_MS = 1500;

const shown = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of [...listeners]) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  const stopAlerts = alertQueue.subscribe(listener);
  return () => {
    listeners.delete(listener);
    stopAlerts();
  };
};
const add = (id: string) => {
  if (shown.has(id)) return;
  shown.add(id);
  emit();
};
const remove = (id: string) => {
  if (shown.delete(id)) emit();
};
const anyShowing = () => shown.size > 0 || alertQueue.snapshot().length > 0;

/**
 * Counts a sheet as on screen from `visible` until its dismissal ended (iOS cannot present while a
 * sheet is still leaving). Returns the `onDismissed` to give the sheet host.
 */
export function useSheetPresence(visible: boolean, onDismissed?: () => void): () => void {
  const id = useId();
  useEffect(() => {
    if (visible) {
      add(id);
      return;
    }
    if (!shown.has(id)) return;
    const timer = setTimeout(() => remove(id), DISMISS_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [visible, id]);
  useEffect(() => () => remove(id), [id]);
  return useCallback(() => {
    remove(id);
    onDismissed?.();
  }, [id, onDismissed]);
}

/** True while any sheet or alert is on screen: something that wants the screen to itself waits. */
export function useOverlayShowing(): boolean {
  return useSyncExternalStore(subscribe, anyShowing, anyShowing);
}
