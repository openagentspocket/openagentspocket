import {
  FileBrowserDownloads,
  type FileBrowserState,
  FileBrowserStore,
  FilePreparer,
  type LocalFiles,
} from '@openagentspocket/core';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ExpoLocalFiles } from './expoLocalFiles';
import type { FileBrowserSource } from './source';

let browsers = 0;

/**
 * Opens a file browser on `source` for as long as the screen lives: starts it on mount, closes it
 * (cancelling transfers, removing downloaded copies) on unmount. null until the Host answers.
 */
export function useFileBrowserStore(source: FileBrowserSource): FileBrowserStore | null {
  const [store, setStore] = useState<FileBrowserStore | null>(null);
  const [local] = useState<LocalFiles>(() => source.local ?? new ExpoLocalFiles());
  useEffect(() => {
    let live = true;
    let opened: FileBrowserStore | undefined;
    source.createHost(local).then((host) => {
      if (!live) return;
      browsers += 1;
      opened = new FileBrowserStore({
        hostName: source.hostName,
        startPath: source.startPath,
        host,
        local,
        downloads: new FileBrowserDownloads(local, `browser-${browsers}`),
        preparer: new FilePreparer(local),
      });
      opened.start();
      setStore(opened);
    });
    return () => {
      live = false;
      opened?.close();
      setStore(null);
    };
  }, [source, local]);
  return store;
}

export function useFileBrowserState(store: FileBrowserStore): FileBrowserState {
  return useSyncExternalStore(store.subscribe, store.getState);
}
