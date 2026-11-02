import type { FileBrowserItem, FileBrowserStore } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Banner, EmptyState, ErrorState, Screen, SkeletonRows } from '@openagentspocket/ui';
import { useState } from 'react';
import { FlatList } from 'react-native';
import { renderMessage } from '@/lib/renderText';
import { FileRow } from './FileRow';
import { FolderHeader } from './FolderHeader';
import { RenameSheet } from './RenameSheet';
import { type FileBrowserSource, useFileBrowserSource } from './source';
import { TransferBar } from './TransferBar';
import { fileMenus } from './useFileActions';
import { useFileBrowserState, useFileBrowserStore } from './useFileBrowser';
import { useFileDialogs } from './useFileDialogs';

/** The file browser of one Host: opens its store for the screen's lifetime, then shows the folder. */
export function FilesScreen({ source }: { source?: FileBrowserSource }) {
  const fallback = useFileBrowserSource();
  const store = useFileBrowserStore(source ?? fallback);
  if (!store) {
    return (
      <Screen scroll={false} testID="files-loading">
        <SkeletonRows />
      </Screen>
    );
  }
  return <FileBrowser store={store} />;
}

function FileBrowser({ store }: { store: FileBrowserStore }) {
  const state = useFileBrowserState(store);
  const [renaming, setRenaming] = useState<FileBrowserItem | null>(null);
  useFileDialogs(store, state);
  const menus = fileMenus(store, setRenaming);
  const partial = state.truncated
    ? t('Showing the first %@ items of this folder.', String(state.items.length))
    : state.scanIncomplete
      ? t('This folder was not read to its end; some items may be missing.')
      : null;
  const empty =
    !state.isLoading && !state.loadError && state.currentPath && state.items.length === 0;

  return (
    <Screen scroll={false} testID="files-screen">
      <FolderHeader
        title={store.title}
        path={store.displayPath}
        loadingLabel={t('Loading %@…', state.hostName)}
        canGoUp={store.canGoUp}
        menu={menus.folder}
        onGoUp={() => store.goUp()}
      />
      {state.transfer ? (
        <TransferBar transfer={state.transfer} onCancel={() => store.cancelTransfer()} />
      ) : null}
      {partial ? <Banner title={partial} tone="info" /> : null}
      {state.loadError ? (
        <ErrorState
          summary={renderMessage(state.loadError)}
          onRetry={() => store.retry()}
          retryLabel={t('Try Again')}
          layout="compact"
        />
      ) : null}
      {state.isLoading && state.items.length === 0 ? <SkeletonRows /> : null}
      {empty ? <EmptyState title={t('Empty Folder')} icon="folder" layout="compact" /> : null}
      <FlatList
        data={state.items}
        keyExtractor={(item) => item.path}
        renderItem={({ item }) => (
          <FileRow
            item={item}
            dimmed={store.isDimmed(item)}
            menu={menus.row(item)}
            onOpen={() => store.open(item)}
          />
        )}
      />
      <RenameSheet
        item={renaming}
        onClose={() => setRenaming(null)}
        onRename={(item, name) => store.rename(item, name)}
      />
    </Screen>
  );
}
