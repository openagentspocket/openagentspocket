import type { FileBrowserStore } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  ActionMenu,
  Banner,
  EmptyState,
  ErrorState,
  makeStyles,
  type ScreenHeader,
  Section,
  SkeletonRows,
} from '@openagentspocket/ui';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { renderMessage } from '@/lib/renderText';
import { AppScreen } from '@/navigation/AppScreen';
import { FileRow } from './FileRow';
import { PathChip } from './PathChip';
import { type FileBrowserSource, useFileBrowserSource } from './source';
import { TransferBar } from './TransferBar';
import { fileMenus } from './useFileActions';
import { useFileBrowserState, useFileBrowserStore } from './useFileBrowser';
import { useFileDialogs } from './useFileDialogs';

const useStyles = makeStyles((theme) => ({
  list: { flex: 1 },
  content: {
    paddingHorizontal: theme.metrics.screenInset,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  transfer: { paddingHorizontal: theme.metrics.screenInset, paddingBottom: theme.spacing.sm },
}));

interface FilesScreenProps {
  source?: FileBrowserSource;
  /** Dismisses the sheet (Done). */
  onDone?: () => void;
}

/** The file browser of one Host: opens its store for the screen's lifetime, then shows the folder. */
export function FilesScreen({ source, onDone }: FilesScreenProps) {
  const fallback = useFileBrowserSource();
  const store = useFileBrowserStore(source ?? fallback);
  if (!store) {
    return (
      <AppScreen scroll={false} testID="files-loading">
        <SkeletonRows />
      </AppScreen>
    );
  }
  return <FileBrowser store={store} onDone={onDone} />;
}

function FileBrowser({ store, onDone }: { store: FileBrowserStore; onDone?: () => void }) {
  const styles = useStyles();
  const [adding, setAdding] = useState(false);
  const state = useFileBrowserState(store);
  useFileDialogs(store, state);
  const menus = fileMenus(store);
  const partial = state.truncated
    ? t('Showing the first %@ items of this folder.', String(state.items.length))
    : state.scanIncomplete
      ? t('This folder was not read to its end; some items may be missing.')
      : null;
  const empty =
    !state.isLoading && !state.loadError && state.currentPath && state.items.length === 0;

  const bar: ScreenHeader = {
    variant: 'sheet',
    title: store.title,
    leading: { label: t('Done'), onPress: onDone ?? (() => {}), testID: 'files-done' },
    trailing: [
      {
        label: t('Parent folder'),
        icon: 'chevronUp',
        disabled: !store.canGoUp,
        onPress: () => store.goUp(),
        testID: 'files-up',
      },
      { label: t('Upload'), icon: 'add', onPress: () => setAdding(true), testID: 'files-add' },
    ],
  };

  return (
    <AppScreen scroll={false} bare header={bar} testID="files-screen">
      <PathChip path={store.displayPath} loadingLabel={t('Loading %@…', state.hostName)} />
      <ScrollView style={styles.list} contentContainerStyle={styles.content}>
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
        <Section>
          {state.items.map((item) => (
            <FileRow
              key={item.path}
              item={item}
              dimmed={store.isDimmed(item)}
              menu={menus.row(item)}
              onOpen={() => store.open(item)}
            />
          ))}
        </Section>
      </ScrollView>
      {state.transfer ? (
        <View style={styles.transfer}>
          <TransferBar transfer={state.transfer} onCancel={() => store.cancelTransfer()} />
        </View>
      ) : null}
      <ActionMenu
        items={menus.folder}
        title={t('Upload')}
        visible={adding}
        onClose={() => setAdding(false)}
      />
    </AppScreen>
  );
}
