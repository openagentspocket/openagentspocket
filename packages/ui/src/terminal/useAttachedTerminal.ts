import type { AttachSnapshot, AttachTerminalStore } from '@openagentspocket/core';
import { utf8Encode } from 'agentico-ssh';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import type { TerminalHandle, TerminalViewProps } from './terminalTypes';

export interface AttachedTerminal {
  readonly snapshot: AttachSnapshot;
  /** Spread onto `<TerminalView {...terminal.viewProps} key={terminal.snapshot.surfaceId} />`. */
  readonly viewProps: Pick<TerminalViewProps, 'ref' | 'onInput' | 'onResize'>;
}

/**
 * Binds an `AttachTerminalStore` to a `TerminalView`: the store's byte feed writes into the
 * view's handle (the native renderer batches the writes and keeps one in flight), typing and
 * the terminal's own replies go to the PTY, the view's grid opens and resizes the session, and
 * returning to the foreground nudges the remote TUI to repaint.
 *
 * Key the view by `snapshot.surfaceId`: a replacement store is a different surface, and the
 * only place a feed acquires its sink is a fresh view. Starting and stopping the store stays
 * with the screen that owns it.
 */
export function useAttachedTerminal(store: AttachTerminalStore): AttachedTerminal {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const handle = useRef<TerminalHandle>(null);

  useEffect(() => {
    return store.feed.acquire({
      write: (bytes) => handle.current?.writeBytes(bytes),
    });
  }, [store]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') store.didBecomeActive();
    });
    return () => subscription.remove();
  }, [store]);

  const onInput = useCallback((data: string) => store.send(utf8Encode(data)), [store]);
  const onResize = useCallback(
    (cols: number, rows: number) => store.viewDidResize(cols, rows),
    [store],
  );

  return { snapshot, viewProps: { ref: handle, onInput, onResize } };
}
